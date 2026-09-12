import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, streamText } from "ai";

import { HttpError } from "../errors.js";
import { getAiApiKey, getAiBaseUrl, getAiModels, isAiConfigured } from "./config.js";

function provider() {
  return createOpenAI({
    apiKey: getAiApiKey(),
    baseURL: getAiBaseUrl(),
  });
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
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new HttpError(503, "AI is not configured. Set AI_API_KEY.");
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL or AI_MODELS.");
  }

  const openai = provider();
  let lastError: unknown;
  for (const modelId of models) {
    try {
      const result = await generateText({
        model: openai.chat(modelId),
        system: options.system,
        prompt: options.prompt,
        timeout: 60_000,
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
}) {
  if (!isAiConfigured()) {
    throw new HttpError(503, "AI is not configured. Set AI_API_KEY.");
  }
  const models = getAiModels();
  if (models.length === 0) {
    throw new HttpError(503, "AI is not configured. Set AI_MODEL or AI_MODELS.");
  }

  const openai = provider();
  return streamText({
    model: openai.chat(models[0]),
    system: options.system,
    messages: options.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    timeout: 60_000,
  });
}
