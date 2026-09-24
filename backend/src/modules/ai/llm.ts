import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, stepCountIs, streamText } from "ai";

import { HttpError } from "../errors.js";
import { getAiApiKey, getAiModels, isAiConfigured, isTavilyConfigured } from "./config.js";
import { SEARCH_RULES } from "./prompts.js";
import { tavilySearchTools } from "./tavily.js";

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

function isProviderFailure(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    return (
      status === 404 ||
      status === 429 ||
      status === 408 ||
      (status >= 500 && status <= 599)
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|ETIMEDOUT|ECONNRESET|fetch failed|not found/i.test(message);
}

function toHttpError(error: unknown): HttpError {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 502;
    const detail =
      typeof error.data === "object" && error.data && "error" in error.data
        ? JSON.stringify(error.data)
        : error.message;
    if (status === 401 || status === 403) {
      return new HttpError(401, detail);
    }
    if (status === 429) {
      return new HttpError(429, detail);
    }
    return new HttpError(502, detail);
  }
  return new HttpError(
    502,
    error instanceof Error ? error.message : "Provider request failed"
  );
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
  const google = provider();
  const tools = options.useSearch ? tavilySearchTools() : undefined;
  let lastError: unknown;
  for (const modelId of models) {
    try {
      const result = await generateText({
        model: google(modelId),
        system: withSearchSystem(options.system, options.useSearch),
        prompt: options.prompt,
        timeout: tools ? 90_000 : 60_000,
        ...(tools ? { tools, stopWhen: stepCountIs(4) } : {}),
      });
      return result.text;
    } catch (error) {
      lastError = error;
      if (!isProviderFailure(error)) {
        throw toHttpError(error);
      }
    }
  }
  throw toHttpError(lastError);
}

export function startTextStream(options: {
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
  return streamText({
    model: google(models[0]),
    system: withSearchSystem(options.system, options.useSearch),
    messages: options.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    timeout: tools ? 90_000 : 60_000,
    ...(tools ? { tools, stopWhen: stepCountIs(4) } : {}),
  });
}
