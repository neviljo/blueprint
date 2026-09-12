import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { getAiHealth, streamAi } from "../lib/ai";
import { dumpElements, sceneElementIds } from "../lib/dumpElements";
import { insertGeneratedElements } from "../lib/insertGeneratedElements";
import { mermaidToElements } from "../lib/mermaidToScene";
import { getAiSession, patchAiSession, subscribeAiSession, type ChatTurn } from "../lib/aiSession";
import { SimpleMarkdown } from "../lib/simpleMarkdown";
import "./ai-sidebar.css";

type TabId = "chat" | "summarize";

interface AiPanelProps {
  tab: TabId;
  canvasId: string;
  getApi: () => ExcalidrawImperativeAPI | null;
}

function currentDump(
  api: ExcalidrawImperativeAPI,
  selectionOnly: boolean
): { dump: string; ids: string[] } {
  const elements = api.getSceneElements();
  const selected = api.getAppState().selectedElementIds;
  const selectedIds = Object.keys(selected || {}).filter((id) => selected[id]);
  const useSelection = selectionOnly && selectedIds.length > 0;
  const subset = useSelection
    ? elements.filter((el) => selectedIds.includes(el.id))
    : elements;
  return { dump: dumpElements(subset), ids: sceneElementIds(subset) };
}

function visibleReply(text: string, pending: boolean | undefined): string {
  if (!pending) return text;
  const visible = text.replace(/```(?:mermaid)?[\s\S]*?(```|$)/gi, "").trimEnd();
  if (visible) return visible;
  return text.trim() ? "Generating diagram…" : "";
}

export default function AiPanel({ tab, canvasId, getApi }: AiPanelProps) {
  const session = useSyncExternalStore(
    subscribeAiSession,
    () => getAiSession(canvasId),
    () => getAiSession(canvasId)
  );
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [summarizeBusy, setSummarizeBusy] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const summaryScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAiHealth()
      .then((health) => {
        if (!cancelled) {
          setConfigured(health.configured);
          setHealthError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setConfigured(false);
          setHealthError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = tab === "chat" ? chatScrollRef.current : summaryScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [tab, session.chatTurns, session.summarizeTurns]);

  const applyMermaid = useCallback(
    async (mermaid: string, replaceIds?: string[]) => {
      const api = getApi();
      if (!api) throw new Error("Canvas is not ready");
      const elements = await mermaidToElements(mermaid);
      insertGeneratedElements(api, elements, replaceIds ? { replaceIds } : undefined);
    },
    [getApi]
  );

  const handleChat = useCallback(async () => {
    const text = chatInput.trim();
    const api = getApi();
    if (!text || !api || chatBusy) return;
    const { dump, ids } = currentDump(api, session.selectionOnly);
    const history: ChatTurn[] = [
      ...session.chatTurns.filter((turn) => !turn.pending),
      { role: "user", content: text },
    ];
    setChatInput("");
    patchAiSession(canvasId, {
      chatTurns: [...history, { role: "assistant", content: "", pending: true }],
    });
    setChatBusy(true);
    try {
      let streamed = "";
      const payload = history.map((turn) => ({ role: turn.role, content: turn.content }));
      const done = await streamAi("/api/ai/chat/stream", { messages: payload, dump }, (token) => {
        streamed += token;
        patchAiSession(canvasId, {
          chatTurns: [...history, { role: "assistant", content: streamed, pending: true }],
        });
      });
      patchAiSession(canvasId, {
        chatTurns: [
          ...history,
          {
            role: "assistant",
            content: done.reply,
            mermaid: done.mermaid,
            replaceIds: ids,
            pending: false,
          },
        ],
      });
    } catch (error) {
      patchAiSession(canvasId, {
        chatTurns: [
          ...history,
          {
            role: "assistant",
            content: error instanceof Error ? error.message : "Chat failed",
            pending: false,
          },
        ],
      });
    } finally {
      setChatBusy(false);
    }
  }, [canvasId, chatBusy, chatInput, getApi, session.chatTurns, session.selectionOnly]);

  const handleApply = useCallback(
    async (turnIndex: number) => {
      const turn = session.chatTurns[turnIndex];
      if (!turn?.mermaid) return;
      try {
        await applyMermaid(turn.mermaid, turn.replaceIds);
        patchAiSession(canvasId, {
          chatTurns: session.chatTurns.map((item, i) =>
            i === turnIndex ? { ...item, mermaid: null } : item
          ),
        });
      } catch (error) {
        patchAiSession(canvasId, {
          chatTurns: session.chatTurns.map((item, i) =>
            i === turnIndex
              ? {
                  ...item,
                  content: `${item.content}\n\n${error instanceof Error ? error.message : "Apply failed"}`,
                }
              : item
          ),
        });
      }
    },
    [applyMermaid, canvasId, session.chatTurns]
  );

  const handleDiscard = useCallback(
    (turnIndex: number) => {
      patchAiSession(canvasId, {
        chatTurns: session.chatTurns.map((item, i) =>
          i === turnIndex ? { ...item, mermaid: null } : item
        ),
      });
    },
    [canvasId, session.chatTurns]
  );

  const handleSummarize = useCallback(async () => {
    const api = getApi();
    if (!api || summarizeBusy) return;
    setSummarizeBusy(true);
    setSummarizeError(null);
    const history = session.summarizeTurns.filter((turn) => !turn.pending);
    const pending: ChatTurn[] = [
      ...history,
      { role: "assistant", content: "", pending: true },
    ];
    patchAiSession(canvasId, { summarizeTurns: pending });
    try {
      const { dump } = currentDump(api, session.selectionOnly);
      let streamed = "";
      const done = await streamAi("/api/ai/summarize/stream", { dump }, (token) => {
        streamed += token;
        patchAiSession(canvasId, {
          summarizeTurns: [...history, { role: "assistant", content: streamed, pending: true }],
        });
      });
      patchAiSession(canvasId, {
        summarizeTurns: [...history, { role: "assistant", content: done.reply, pending: false }],
      });
    } catch (error) {
      setSummarizeError(error instanceof Error ? error.message : "Summarize failed");
      patchAiSession(canvasId, { summarizeTurns: history });
    } finally {
      setSummarizeBusy(false);
    }
  }, [canvasId, getApi, session.selectionOnly, session.summarizeTurns, summarizeBusy]);

  if (configured === null) {
    return <div className="blueprint-ai-sidebar__body">Loading AI…</div>;
  }

  if (!configured) {
    return (
      <div className="blueprint-ai-sidebar__body">
        <p className="blueprint-ai-sidebar__error">
          AI is not configured. Set AI_API_KEY on the server.
          {healthError ? ` ${healthError}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="blueprint-ai-sidebar">
      <div className="blueprint-ai-sidebar__body">
        <label className="blueprint-ai-check">
          <input
            type="checkbox"
            checked={session.selectionOnly}
            onChange={(e) => patchAiSession(canvasId, { selectionOnly: e.target.checked })}
          />
          Use selection only
        </label>

        {tab === "chat" && (
          <>
            <div className="blueprint-ai-sidebar__chat" ref={chatScrollRef}>
              {session.chatTurns.map((turn, i) => (
                <div
                  key={i}
                  className={`blueprint-ai-sidebar__bubble${
                    turn.role === "user" ? " blueprint-ai-sidebar__bubble--user" : ""
                  }`}
                >
                  {turn.role === "user" ? (
                    turn.content
                  ) : (
                    <SimpleMarkdown text={visibleReply(turn.content, turn.pending)} />
                  )}
                  {turn.role === "assistant" && turn.mermaid && !turn.pending && (
                    <div className="blueprint-ai-sidebar__actions">
                      <button type="button" className="blueprint-ai-btn" onClick={() => void handleApply(i)}>
                        Apply
                      </button>
                      <button
                        type="button"
                        className="blueprint-ai-btn blueprint-ai-btn--ghost"
                        onClick={() => handleDiscard(i)}
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <textarea
              className="blueprint-ai-sidebar__composer"
              placeholder="Ask or request a change…"
              value={chatInput}
              disabled={chatBusy}
              rows={3}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleChat();
                }
              }}
            />
          </>
        )}

        {tab === "summarize" && (
          <>
            <button
              type="button"
              className="blueprint-ai-btn"
              onClick={() => void handleSummarize()}
              disabled={summarizeBusy}
            >
              {summarizeBusy ? "Summarizing…" : "Summarize drawing"}
            </button>
            {summarizeError && <p className="blueprint-ai-sidebar__error">{summarizeError}</p>}
            <div className="blueprint-ai-sidebar__summary" ref={summaryScrollRef}>
              {session.summarizeTurns.map((turn, i) => (
                <div key={i} className="blueprint-ai-sidebar__bubble">
                  <SimpleMarkdown text={turn.content} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
