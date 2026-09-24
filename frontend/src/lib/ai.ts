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

function consumeSse(chunk: string, onToken: (text: string) => void): string {
  const events = chunk.split("\n\n");
  const rest = events.pop() ?? "";
  for (const event of events) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data || data === "[DONE]") continue;
    const token = JSON.parse(data) as unknown;
    if (typeof token === "string" && token) onToken(token);
  }
  return rest;
}

export async function streamAi(
  path: "/api/ai/chat/stream" | "/api/ai/summarize/stream",
  body: unknown,
  onToken: (text: string) => void
): Promise<StreamDone> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
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
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = consumeSse(buffer, (token) => {
      full += token;
      onToken(token);
    });
    if (done) {
      if (buffer.trim()) {
        consumeSse(buffer + "\n\n", (token) => {
          full += token;
          onToken(token);
        });
      }
      break;
    }
  }

  if (path === "/api/ai/summarize/stream") {
    return { reply: full.trim(), mermaid: null };
  }

  const mermaid = extractMermaid(full);
  return {
    reply: mermaid ? stripMermaidFences(full) : full.trim(),
    mermaid,
  };
}
