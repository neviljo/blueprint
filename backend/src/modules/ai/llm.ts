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
  isProviderConfigured,
  isTavilyConfigured,
  resolveProvider,
  type AiProvider,
} from "./config.js";
import { acquireAiLock } from "./lock.js";
import { SEARCH_RULES } from "./prompts.js";
import { tavilySearchTools } from "./tavily.js";

const BACKOFF_MS = [1000, 2000];

function languageModel(modelId: string, provider: AiProvider): LanguageModel {
  if (provider === "groq") {
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
  if (statusOf(error) === 404) return true;
  return /does not exist|model_not_found|not found|unknown model/i.test(errorText(error));
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

function providerLabel(provider: AiProvider): string {
  return provider === "groq" ? "Groq" : "Gemini";
}

function missingKeyMessage(provider: AiProvider): string {
  return provider === "groq"
    ? "Groq is not configured. Set GROQ_API_KEY."
    : "Gemini is not configured. Set AI_API_KEY.";
}

function missingModelMessage(modelId: string, provider: AiProvider): HttpError {
  return new HttpError(
    404,
    `Model "${modelId}" does not exist on ${provider}. ${
      provider === "groq"
        ? "Set GROQ_MODEL to a chat model (e.g. llama-3.1-8b-instant)."
        : "Set AI_MODEL to a Gemini chat model."
    }`
  );
}

function toHttpError(error: unknown, provider: AiProvider): HttpError {
  if (error instanceof HttpError) return error;
  if (isRateLimited(error)) {
    return new HttpError(429, `${providerLabel(provider)} rate limit. Wait a minute and try again.`);
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

function requireProvider(requested?: string | null): AiProvider {
  const provider = resolveProvider(requested);
  if (!isProviderConfigured(provider)) {
    throw new HttpError(503, missingKeyMessage(provider));
  }
  const models = getAiModels(provider);
  if (models.length === 0) {
    throw new HttpError(
      503,
      provider === "groq"
        ? "AI is not configured. Set GROQ_MODEL."
        : "AI is not configured. Set AI_MODEL or AI_MODELS."
    );
  }
  return provider;
}

async function generateWithBackoff(
  modelId: string,
  provider: AiProvider,
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
        model: languageModel(modelId, provider),
        system: withSearchSystem(options.system, options.useTools),
        prompt: options.prompt,
        maxRetries: 0,
        ...toolSettings(options.useTools),
      });
      return result.text;
    } catch (error) {
      lastError = error;
      if (isMissingModel(error)) {
        throw missingModelMessage(modelId, provider);
      }
      if (options.useTools && isToolRequestFailure(error)) {
        return generateWithBackoff(modelId, provider, { ...options, useTools: false });
      }
      if (isRateLimited(error)) throw error;
      if (isTransient(error)) continue;
      throw error;
    }
  }
  throw lastError;
}

function textFromDelta(part: { type: string; text?: string; delta?: string }): string {
  if (part.type !== "text-delta") return "";
  if (typeof part.text === "string" && part.text) return part.text;
  if (typeof part.delta === "string" && part.delta) return part.delta;
  return "";
}

async function* streamWithBackoff(
  modelId: string,
  provider: AiProvider,
  options: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    useTools: boolean;
  }
): AsyncGenerator<string> {
  let lastError: unknown;
  const attempts = BACKOFF_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    let yielded = false;
    try {
      const stream = streamText({
        model: languageModel(modelId, provider),
        system: withSearchSystem(options.system, options.useTools),
        messages: options.messages,
        maxRetries: 0,
        ...toolSettings(options.useTools),
      });
      for await (const part of stream.fullStream) {
        if (part.type === "error") {
          throw "error" in part && part.error ? part.error : new Error("Stream error");
        }
        const delta = textFromDelta(part);
        if (delta) {
          yielded = true;
          yield delta;
          continue;
        }
        if (
          part.type === "tool-call" ||
          part.type === "tool-result" ||
          part.type === "start-step" ||
          part.type === "finish-step" ||
          part.type === "tool-input-start"
        ) {
          yield "";
        }
      }
      return;
    } catch (error) {
      lastError = error;
      if (yielded) throw toHttpError(error, provider);
      if (isMissingModel(error)) {
        throw missingModelMessage(modelId, provider);
      }
      if (options.useTools && isToolRequestFailure(error)) {
        yield* streamWithBackoff(modelId, provider, { ...options, useTools: false });
        return;
      }
      if (isRateLimited(error)) throw error;
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
  provider?: string | null;
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new HttpError(503, missingKeyMessage(getAiProvider()));
  }
  const provider = requireProvider(options.provider);
  const models = getAiModels(provider);

  const release = acquireAiLock();
  try {
    const useTools = options.allowTools !== false && isTavilyConfigured();
    let lastError: unknown;
    for (const modelId of models) {
      try {
        return await generateWithBackoff(modelId, provider, { ...options, useTools });
      } catch (error) {
        lastError = error;
        if (shouldTryNextModel(error)) continue;
        throw toHttpError(error, provider);
      }
    }
    throw toHttpError(lastError, provider);
  } finally {
    release();
  }
}

export async function startTextStream(options: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  allowTools?: boolean;
  provider?: string | null;
}) {
  if (!isAiConfigured()) {
    throw new HttpError(503, missingKeyMessage(getAiProvider()));
  }
  const provider = requireProvider(options.provider);
  const models = getAiModels(provider);
  const useTools = options.allowTools !== false && isTavilyConfigured();
  const messages = options.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  async function* textStream() {
    const release = acquireAiLock();
    try {
      let lastError: unknown;
      for (const modelId of models) {
        try {
          yield* streamWithBackoff(modelId, provider, {
            system: options.system,
            messages,
            useTools,
          });
          return;
        } catch (error) {
          lastError = error;
          if (error instanceof HttpError && error.status === 404) {
            if (shouldTryNextModel(error)) continue;
            throw error;
          }
          if (shouldTryNextModel(error)) continue;
          throw toHttpError(error, provider);
        }
      }
      throw toHttpError(lastError, provider);
    } finally {
      release();
    }
  }

  return { textStream: textStream() };
}
