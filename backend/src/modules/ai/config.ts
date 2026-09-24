import "dotenv/config";

export type AiProvider = "google" | "groq";

function splitModels(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function getAiProvider(): AiProvider {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (raw === "groq") return "groq";
  if (raw === "google" || raw === "gemini") return "google";
  if (isGoogleConfigured()) return "google";
  if (isGroqConfigured()) return "groq";
  return "google";
}

export function isAiConfigured(): boolean {
  return getAiProvider() === "groq" ? isGroqConfigured() : isGoogleConfigured();
}

export function getAiApiKey(): string {
  return process.env.AI_API_KEY?.trim() ?? "";
}

export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() ?? "";
}

export function getTavilyApiKey(): string {
  return process.env.TAVILY_API_KEY?.trim() ?? "";
}

export function isTavilyConfigured(): boolean {
  return Boolean(getTavilyApiKey());
}

export function getAiModels(): string[] {
  if (getAiProvider() === "groq") {
    const groq = process.env.GROQ_MODEL?.trim() || process.env.GROQ_MODELS?.trim() || "";
    if (groq) return splitModels(groq);
    const shared = process.env.AI_MODELS?.trim() || process.env.AI_MODEL?.trim() || "";
    const parts = splitModels(shared);
    if (parts.length > 0 && !parts.some((id) => id.toLowerCase().startsWith("gemini"))) {
      return parts;
    }
    return ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  }
  const raw = process.env.AI_MODELS?.trim() || process.env.AI_MODEL?.trim() || "";
  return splitModels(raw);
}
