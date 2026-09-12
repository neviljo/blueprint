import { extractMermaid, stripMermaidFences } from "./mermaidParse";

export interface AiHealth {
  configured: boolean;
  models: string[];
}

export interface StreamDone {
  reply: string;
  mermaid: string | null;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string; detail?: string; error?: string };
    return data.message || data.detail || data.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function getAiHealth(): Promise<AiHealth> {
  const response = await fetch("/api/ai/health", { credentials: "include" });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<AiHealth>;
}

export async function generateDiagram(prompt: string, repair = false): Promise<string> {
  const response = await fetch("/api/ai/diagram", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, repair }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as { mermaid: string };
  return data.mermaid;
}

export async function streamAi(
  path: "/api/ai/chat/stream" | "/api/ai/summarize/stream",
  body: unknown,
  onToken: (text: string) => void
): Promise<StreamDone> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    full += chunk;
    onToken(chunk);
  }
  full += decoder.decode();

  if (path === "/api/ai/summarize/stream") {
    return { reply: full.trim(), mermaid: null };
  }

  const mermaid = extractMermaid(full);
  return {
    reply: mermaid ? stripMermaidFences(full) : full.trim(),
    mermaid,
  };
}
