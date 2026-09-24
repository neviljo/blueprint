import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { APICallError, generateText, stepCountIs, streamText, type LanguageModel } from "ai";

import { HttpError } from "../errors.js";
import {
  getAiApiKey,
  getAiModels,
  getAiProvider,
  getGroqApiKey,
  isAiConfigured,
  isTavilyConfigured,
} from "./config.js";
import { acquireAiLock } from "./lock.js";
import { SEARCH_RULES } from "./prompts.js";
import { tavilySearchTools } from "./tavily.js";

const BACKOFF_MS = [1000, 2000];

function languageModel(modelId: string): LanguageModel {
  if (getAiProvider() === "groq") {
    return createGroq({ apiKey: getGroqApiKey() })(modelId);
  }
  return createGoogleGenerativeAI({ apiKey: getAiApiKey() })(modelId);
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

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const nested =
      "cause" in error && error.cause instanceof Error ? error.cause.message : "";
    return `${error.message} ${nested}`;
  }
  return String(error);
}

function isRateLimited(error: unknown): boolean {
  if (statusOf(error) === 429) return true;
  return /429|too many requests|resource.?exhausted|rate.?limit|high demand|overloaded|unavailable|try again later|failed after \d+ attempts/i.test(
    errorText(error)
  );
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

function missingKeyMessage(): string {
  return getAiProvider() === "groq"
    ? "AI is not configured. Set GROQ_API_KEY."
    : "AI is not configured. Set AI_API_KEY.";
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (isRateLimited(error)) {
    const name = getAiProvider() === "groq" ? "Groq" : "Gemini";
    return new HttpError(429, `${name} rate limit. Wait a minute and try again.`);
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
        model: languageModel(modelId),
        system: withSearchSystem(options.system, options.useTools),
        prompt: options.prompt,
        maxRetries: 0,
        ...toolSettings(options.useTools),
      });
      return result.text;
    } catch (error) {
      lastError = error;
      if (options.useTools && isToolRequestFailure(error)) {
        return generateWithBackoff(modelId, { ...options, useTools: false });
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
  allowTools?: boolean;
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new HttpError(503, missingKeyMessage());
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL, AI_MODELS, or GROQ_MODEL.");
  }

  const release = acquireAiLock();
  try {
    const useTools = options.allowTools !== false && isTavilyConfigured();
    let lastError: unknown;
    for (const modelId of models) {
      try {
        return await generateWithBackoff(modelId, { ...options, useTools });
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
  allowTools?: boolean;
}) {
  if (!isAiConfigured()) {
    throw new HttpError(503, missingKeyMessage());
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL, AI_MODELS, or GROQ_MODEL.");
  }

  const useTools = options.allowTools !== false && isTavilyConfigured();
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
            const text = await generateWithBackoff(modelId, {
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
            model: languageModel(modelId),
            system: options.system,
            messages,
            maxRetries: 0,
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
