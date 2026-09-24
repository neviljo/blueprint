export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  mermaid?: string | null;
  replaceIds?: string[];
  pending?: boolean;
}

export interface AiSession {
  chatTurns: ChatTurn[];
  summarizeTurns: ChatTurn[];
  selectionOnly: boolean;
}

const sessions = new Map<string, AiSession>();
const listeners = new Set<() => void>();

function emptySession(): AiSession {
  return { chatTurns: [], summarizeTurns: [], selectionOnly: false };
}

export function getAiSession(canvasId: string): AiSession {
  const existing = sessions.get(canvasId);
  if (existing) return existing;
  const created = emptySession();
  sessions.set(canvasId, created);
  return created;
}

export function patchAiSession(canvasId: string, patch: Partial<AiSession>): AiSession {
  const next = { ...getAiSession(canvasId), ...patch };
  sessions.set(canvasId, next);
  listeners.forEach((listener) => listener());
  return next;
}

export function subscribeAiSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
