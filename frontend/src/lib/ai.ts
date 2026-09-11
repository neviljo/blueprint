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
  let buffer = "";
  let donePayload: StreamDone | null = null;

  const consume = (chunk: string) => {
    const events = chunk.split("\n\n");
    for (const event of events) {
      const line = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!line) continue;
      const payload = JSON.parse(line) as
        | { type: "token"; text: string }
        | { type: "done"; reply: string; mermaid?: string | null }
        | { type: "error"; detail: string };
      if (payload.type === "token") {
        onToken(payload.text);
      } else if (payload.type === "done") {
        donePayload = { reply: payload.reply, mermaid: payload.mermaid ?? null };
      } else if (payload.type === "error") {
        throw new Error(payload.detail);
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    if (parts.length > 0) {
      consume(parts.join("\n\n") + "\n\n");
    }
    if (done) {
      if (buffer.trim()) consume(buffer);
      break;
    }
  }

  if (!donePayload) {
    throw new Error("Stream ended without a done event");
  }
  return donePayload;
}
