import "dotenv/config";

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}

export function getAiApiKey(): string {
  return process.env.AI_API_KEY?.trim() ?? "";
}

export function getAiBaseUrl(): string {
  return (
    process.env.AI_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta/openai/"
  );
}

export function getAiModels(): string[] {
  const raw = process.env.AI_MODELS?.trim() || process.env.AI_MODEL?.trim() || "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
