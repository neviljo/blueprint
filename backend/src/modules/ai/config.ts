import "dotenv/config";

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}

export function getAiApiKey(): string {
  return process.env.AI_API_KEY?.trim() ?? "";
}

export function getTavilyApiKey(): string {
  return process.env.TAVILY_API_KEY?.trim() ?? "";
}

export function isTavilyConfigured(): boolean {
  return Boolean(getTavilyApiKey());
}

export function getAiModels(): string[] {
  const raw = process.env.AI_MODELS?.trim() || process.env.AI_MODEL?.trim() || "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
