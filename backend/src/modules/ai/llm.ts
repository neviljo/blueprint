import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, stepCountIs, streamText } from "ai";

import { HttpError } from "../errors.js";
import {
  getAiApiKey,
  getAiBaseUrl,
  getAiModels,
  isAiConfigured,
  isTavilyConfigured,
} from "./config.js";
import { acquireAiLock } from "./lock.js";
import { SEARCH_RULES } from "./prompts.js";
import { tavilySearchTools } from "./tavily.js";

const BACKOFF_MS = [1000, 2000, 4000];
const STREAM_RETRY_MS = 2000;

function provider() {
  return createOpenAI({
    apiKey: getAiApiKey(),
    baseURL: getAiBaseUrl(),
    name: "gemini",
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
  return /invalid argument|function.?call|tool|schema/i.test(message);
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
  openai: ReturnType<typeof createOpenAI>,
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
        model: openai.chat(modelId),
        system: withSearchSystem(options.system, options.useTools),
        prompt: options.prompt,
        ...toolSettings(options.useTools),
      });
      return result.text;
    } catch (error) {
      lastError = error;
      if (options.useTools && isToolRequestFailure(error)) {
        return generateWithBackoff(openai, modelId, { ...options, useTools: false });
      }
      if (isRateLimited(error) || isTransient(error)) continue;
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
    const openai = provider();
    const useTools = isTavilyConfigured();
    let lastError: unknown;
    for (const modelId of models) {
      try {
        return await generateWithBackoff(openai, modelId, { ...options, useTools });
      } catch (error) {
        lastError = error;
        if (isRateLimited(error)) {
          throw toHttpError(error);
        }
        if (isMissingModel(error) || isTransient(error)) {
          continue;
        }
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

  const openai = provider();
  const useTools = isTavilyConfigured();
  const messages = options.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const openStream = (withTools: boolean) =>
    streamText({
      model: openai.chat(models[0]),
      system: withSearchSystem(options.system, withTools),
      messages,
      ...toolSettings(withTools),
    });

  async function* textStream() {
    const release = acquireAiLock();
    try {
      let received = false;
      try {
        for await (const delta of openStream(useTools).textStream) {
          received = true;
          yield delta;
        }
      } catch (error) {
        if (received) throw toHttpError(error);
        if (useTools && isToolRequestFailure(error)) {
          for await (const delta of openStream(false).textStream) {
            yield delta;
          }
          return;
        }
        if (!(isRateLimited(error) || isTransient(error))) {
          throw toHttpError(error);
        }
        await sleep(STREAM_RETRY_MS);
        for await (const delta of openStream(useTools).textStream) {
          yield delta;
        }
      }
    } finally {
      release();
    }
  }

  return { textStream: textStream() };
}
