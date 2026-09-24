import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, stepCountIs, streamText } from "ai";

import { HttpError } from "../errors.js";
import { getAiApiKey, getAiModels, isAiConfigured, isTavilyConfigured } from "./config.js";
import { acquireAiLock } from "./lock.js";
import { SEARCH_RULES } from "./prompts.js";
import { tavilySearchTools } from "./tavily.js";

const BACKOFF_MS = [1000, 2000];

function provider() {
  return createGoogleGenerativeAI({
    apiKey: getAiApiKey(),
  });
}

function withSearchSystem(system: string, useTools: boolean): string {
  if (!useTools) return system;
  return `${system}\n\n${SEARCH_RULES}`;
}

function toolSettings(useTools: boolean) {
  if (!useTools) return {};
  return { tools: tavilySearchTools(), stopWhen: stepCountIs(6) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(error: unknown): number {
  if (APICallError.isInstance(error)) return error.statusCode ?? 0;
  return 0;
}

function isRateLimited(error: unknown): boolean {
  if (statusOf(error) === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests|resource.?exhausted|rate.?limit/i.test(message);
}

function isMissingModel(error: unknown): boolean {
  return statusOf(error) === 404;
}

function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 408 || (status >= 500 && status <= 599)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message);
}

function isToolRequestFailure(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 400) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /invalid argument|function.?call|tool call|schema/i.test(message);
}

function shouldTryNextModel(error: unknown): boolean {
  return isRateLimited(error) || isMissingModel(error) || isTransient(error);
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (isRateLimited(error)) {
    return new HttpError(429, "Gemini Free tier rate limit. Wait a minute and try again.");
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 502;
    const detail =
      typeof error.data === "object" && error.data && "error" in error.data
        ? JSON.stringify(error.data)
        : error.message;
    if (status === 401 || status === 403) {
      return new HttpError(401, detail);
    }
    return new HttpError(502, detail);
  }
  return new HttpError(
    502,
    error instanceof Error ? error.message : "Provider request failed"
  );
}

async function generateWithBackoff(
  google: ReturnType<typeof createGoogleGenerativeAI>,
  modelId: string,
  options: {
    system: string;
    prompt: string;
    useTools: boolean;
  }
): Promise<string> {
  let lastError: unknown;
  const attempts = BACKOFF_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const result = await generateText({
        model: google(modelId),
        system: withSearchSystem(options.system, options.useTools),
        prompt: options.prompt,
        ...toolSettings(options.useTools),
      });
      return result.text;
    } catch (error) {
      lastError = error;
      if (options.useTools && isToolRequestFailure(error)) {
        return generateWithBackoff(google, modelId, { ...options, useTools: false });
      }
      if (isRateLimited(error) || isMissingModel(error)) throw error;
      if (isTransient(error)) continue;
      throw error;
    }
  }
  throw lastError;
}

export async function completeText(options: {
  system: string;
  prompt: string;
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new HttpError(503, "AI is not configured. Set AI_API_KEY.");
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL or AI_MODELS.");
  }

  const release = acquireAiLock();
  try {
    const google = provider();
    const useTools = isTavilyConfigured();
    let lastError: unknown;
    for (const modelId of models) {
      try {
        return await generateWithBackoff(google, modelId, { ...options, useTools });
      } catch (error) {
        lastError = error;
        if (shouldTryNextModel(error)) continue;
        throw toHttpError(error);
      }
    }
    throw toHttpError(lastError);
  } finally {
    release();
  }
}

export async function startTextStream(options: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}) {
  if (!isAiConfigured()) {
    throw new HttpError(503, "AI is not configured. Set AI_API_KEY.");
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL or AI_MODELS.");
  }

  const google = provider();
  const useTools = isTavilyConfigured();
  const messages = options.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  async function* textStream() {
    const release = acquireAiLock();
    try {
      if (useTools) {
        let lastError: unknown;
        const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
        for (const modelId of models) {
          try {
            const text = await generateWithBackoff(google, modelId, {
              system: options.system,
              prompt,
              useTools: true,
            });
            if (text) yield text;
            return;
          } catch (error) {
            lastError = error;
            if (shouldTryNextModel(error)) continue;
            throw toHttpError(error);
          }
        }
        throw toHttpError(lastError);
      }

      let lastError: unknown;
      for (const modelId of models) {
        let yielded = false;
        try {
          const stream = streamText({
            model: google(modelId),
            system: options.system,
            messages,
          });
          for await (const delta of stream.textStream) {
            yielded = true;
            yield delta;
          }
          return;
        } catch (error) {
          lastError = error;
          if (yielded) throw toHttpError(error);
          if (shouldTryNextModel(error)) continue;
          throw toHttpError(error);
        }
      }
      throw toHttpError(lastError);
    } finally {
      release();
    }
  }

  return { textStream: textStream() };
}
