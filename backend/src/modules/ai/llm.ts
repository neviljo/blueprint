import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, stepCountIs, streamText } from "ai";

import { HttpError } from "../errors.js";
import { getAiApiKey, getAiModels, isAiConfigured, isTavilyConfigured } from "./config.js";
import { acquireAiLock } from "./lock.js";
import { SEARCH_RULES } from "./prompts.js";
import { tavilySearchTools } from "./tavily.js";

const BACKOFF_MS = [1000, 2000, 4000];
const STREAM_RETRY_MS = 2000;

function provider() {
  return createGoogleGenerativeAI({
    apiKey: getAiApiKey(),
  });
}

function withSearchSystem(system: string, useSearch: boolean | undefined): string {
  if (!useSearch) return system;
  return `${system}\n\n${SEARCH_RULES}`;
}

function requireSearchReady(useSearch: boolean | undefined) {
  if (useSearch && !isTavilyConfigured()) {
    throw new HttpError(503, "Web search is not configured. Set TAVILY_API_KEY.");
  }
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

function callSettings(options: {
  useSearch?: boolean;
  tools?: ReturnType<typeof tavilySearchTools>;
}) {
  const tools = options.tools;
  return tools ? { tools, stopWhen: stepCountIs(6) } : {};
}

async function generateWithBackoff(
  google: ReturnType<typeof createGoogleGenerativeAI>,
  modelId: string,
  options: {
    system: string;
    prompt: string;
    useSearch?: boolean;
    tools?: ReturnType<typeof tavilySearchTools>;
  }
): Promise<string> {
  let lastError: unknown;
  const attempts = BACKOFF_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const result = await generateText({
        model: google(modelId),
        system: withSearchSystem(options.system, options.useSearch),
        prompt: options.prompt,
        ...callSettings(options),
      });
      return result.text;
    } catch (error) {
      lastError = error;
      if (isRateLimited(error) || isTransient(error)) continue;
      throw error;
    }
  }
  throw lastError;
}

export async function completeText(options: {
  system: string;
  prompt: string;
  useSearch?: boolean;
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new HttpError(503, "AI is not configured. Set AI_API_KEY.");
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL or AI_MODELS.");
  }

  requireSearchReady(options.useSearch);
  const release = acquireAiLock();
  try {
    const google = provider();
    const tools = options.useSearch ? tavilySearchTools() : undefined;
    let lastError: unknown;
    for (const modelId of models) {
      try {
        return await generateWithBackoff(google, modelId, { ...options, tools });
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
  useSearch?: boolean;
}) {
  if (!isAiConfigured()) {
    throw new HttpError(503, "AI is not configured. Set AI_API_KEY.");
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL or AI_MODELS.");
  }

  requireSearchReady(options.useSearch);
  const google = provider();
  const tools = options.useSearch ? tavilySearchTools() : undefined;
  const messages = options.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const openStream = () =>
    streamText({
      model: google(models[0]),
      system: withSearchSystem(options.system, options.useSearch),
      messages,
      ...callSettings({ useSearch: options.useSearch, tools }),
    });

  async function* textStream() {
    const release = acquireAiLock();
    try {
      // Gemini streaming + function calls often yields no text or 400s.
      // Run tool rounds with generateText, then emit the final answer.
      if (tools) {
        let lastError: unknown;
        for (const modelId of models) {
          try {
            const result = await generateWithBackoff(google, modelId, {
              system: options.system,
              prompt: messages
                .map((message) => `${message.role}: ${message.content}`)
                .join("\n\n"),
              useSearch: options.useSearch,
              tools,
            });
            if (result) yield result;
            return;
          } catch (error) {
            lastError = error;
            if (isRateLimited(error)) throw toHttpError(error);
            if (isMissingModel(error) || isTransient(error)) continue;
            throw toHttpError(error);
          }
        }
        throw toHttpError(lastError);
      }

      let received = false;
      try {
        for await (const delta of openStream().textStream) {
          received = true;
          yield delta;
        }
      } catch (error) {
        if (received || !(isRateLimited(error) || isTransient(error))) {
          throw toHttpError(error);
        }
        await sleep(STREAM_RETRY_MS);
        for await (const delta of openStream().textStream) {
          yield delta;
        }
      }
    } finally {
      release();
    }
  }

  return { textStream: textStream() };
}
