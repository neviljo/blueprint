import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { getAiHealth, streamAi } from "../lib/ai";
import { dumpElements, sceneElementIds } from "../lib/dumpElements";
import { insertGeneratedElements } from "../lib/insertGeneratedElements";
import { mermaidToElements } from "../lib/mermaidToScene";
import { SimpleMarkdown } from "../lib/simpleMarkdown";
import "./ai-sidebar.css";

type TabId = "chat" | "summarize";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  mermaid?: string | null;
  replaceIds?: string[];
  pending?: boolean;
}

interface AiPanelProps {
  tab: TabId;
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

export default function AiPanel({ tab, getApi }: AiPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [summarizeText, setSummarizeText] = useState("");
  const [summarizeBusy, setSummarizeBusy] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

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
    if (!text || !api) return;
    const { dump, ids } = currentDump(api, selectionOnly);
    const history = [...chatTurns.filter((t) => !t.pending), { role: "user" as const, content: text }];
    setChatInput("");
    setChatTurns([...history, { role: "assistant", content: "", pending: true }]);
    setChatBusy(true);
    try {
      let streamed = "";
      const done = await streamAi("/api/ai/chat/stream", { messages: history, dump }, (token) => {
        streamed += token;
        setChatTurns([...history, { role: "assistant", content: streamed, pending: true }]);
      });
      setChatTurns([
        ...history,
        {
          role: "assistant",
          content: done.reply,
          mermaid: done.mermaid,
          replaceIds: ids,
          pending: false,
        },
      ]);
    } catch (error) {
      setChatTurns([
        ...history,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Chat failed",
          pending: false,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatTurns, getApi, selectionOnly]);

  const handleApply = useCallback(
    async (turnIndex: number) => {
      const turn = chatTurns[turnIndex];
      if (!turn?.mermaid) return;
      try {
        await applyMermaid(turn.mermaid, turn.replaceIds);
        setChatTurns((prev) =>
          prev.map((item, i) => (i === turnIndex ? { ...item, mermaid: null } : item))
        );
      } catch (error) {
        setChatTurns((prev) =>
          prev.map((item, i) =>
            i === turnIndex
              ? {
                  ...item,
                  content: `${item.content}\n\n${error instanceof Error ? error.message : "Apply failed"}`,
                }
              : item
          )
        );
      }
    },
    [applyMermaid, chatTurns]
  );

  const handleDiscard = useCallback((turnIndex: number) => {
    setChatTurns((prev) =>
      prev.map((item, i) => (i === turnIndex ? { ...item, mermaid: null } : item))
    );
  }, []);

  const handleSummarize = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setSummarizeBusy(true);
    setSummarizeError(null);
    setSummarizeText("");
    try {
      const { dump } = currentDump(api, selectionOnly);
      let streamed = "";
      const done = await streamAi("/api/ai/summarize/stream", { dump }, (token) => {
        streamed += token;
        setSummarizeText(streamed);
      });
      setSummarizeText(done.reply);
    } catch (error) {
      setSummarizeError(error instanceof Error ? error.message : "Summarize failed");
    } finally {
      setSummarizeBusy(false);
    }
  }, [getApi, selectionOnly]);

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
            checked={selectionOnly}
            onChange={(e) => setSelectionOnly(e.target.checked)}
          />
          Use selection only
        </label>

        {tab === "chat" && (
          <>
            <div className="blueprint-ai-sidebar__chat">
              {chatTurns.map((turn, i) => (
                <div
                  key={i}
                  className={`blueprint-ai-sidebar__bubble${
                    turn.role === "user" ? " blueprint-ai-sidebar__bubble--user" : ""
                  }`}
                >
                  {turn.role === "user" ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{turn.content}</div>
                  ) : (
                    <SimpleMarkdown text={turn.content} />
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
            <input
              type="text"
              placeholder="Ask or request a change…"
              value={chatInput}
              disabled={chatBusy}
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
            {summarizeText && <SimpleMarkdown text={summarizeText} />}
          </>
        )}
      </div>
    </div>
  );
}
