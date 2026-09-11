import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControlLabel,
  IconButton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { generateDiagram, getAiHealth, streamAi } from "../lib/ai";
import { dumpElements, sceneElementIds } from "../lib/dumpElements";
import { insertGeneratedElements } from "../lib/insertGeneratedElements";
import { mermaidToElements, MermaidConvertError } from "../lib/mermaidToScene";
import { SimpleMarkdown } from "../lib/simpleMarkdown";

type TabId = "generate" | "chat" | "summarize";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  mermaid?: string | null;
  replaceIds?: string[];
  pending?: boolean;
}

interface AiPanelProps {
  open: boolean;
  onClose: () => void;
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

export default function AiPanel({ open, onClose, getApi }: AiPanelProps) {
  const [tab, setTab] = useState<TabId>("generate");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [summarizeText, setSummarizeText] = useState("");
  const [summarizeBusy, setSummarizeBusy] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const applyMermaid = useCallback(
    async (mermaid: string, replaceIds?: string[]) => {
      const api = getApi();
      if (!api) throw new Error("Canvas is not ready");
      const elements = await mermaidToElements(mermaid);
      insertGeneratedElements(api, elements, replaceIds ? { replaceIds } : undefined);
    },
    [getApi]
  );

  const handleGenerate = useCallback(async () => {
    const prompt = generatePrompt.trim();
    if (!prompt) return;
    setGenerateBusy(true);
    setGenerateError(null);
    try {
      const tryInsert = async (definition: string) => {
        await applyMermaid(definition);
      };
      try {
        const mermaid = await generateDiagram(prompt);
        await tryInsert(mermaid);
      } catch (error) {
        if (error instanceof MermaidConvertError) {
          const mermaid = await generateDiagram(prompt, true);
          await tryInsert(mermaid);
        } else {
          throw error;
        }
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "Generate failed");
    } finally {
      setGenerateBusy(false);
    }
  }, [applyMermaid, generatePrompt]);

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
              ? { ...item, content: `${item.content}\n\n${error instanceof Error ? error.message : "Apply failed"}` }
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

  const notConfigured = configured === false;

  const body = useMemo(() => {
    if (configured === null) {
      return (
        <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={28} />
        </Box>
      );
    }
    if (notConfigured) {
      return (
        <Box sx={{ p: 2.5 }}>
          <Typography variant="body2" sx={{ color: "#f87171" }}>
            AI is not configured. Set AI_API_KEY (and AI_BASE_URL / AI_MODEL) on the backend.
            {healthError ? ` ${healthError}` : ""}
          </Typography>
        </Box>
      );
    }
    return (
      <>
        <Tabs
          value={tab}
          onChange={(_, value: TabId) => setTab(value)}
          variant="fullWidth"
          sx={{ borderBottom: "1px solid #2a2a2a", minHeight: 40 }}
        >
          <Tab value="generate" label="Generate" />
          <Tab value="chat" label="Chat" />
          <Tab value="summarize" label="Summarize" />
        </Tabs>
        {(tab === "chat" || tab === "summarize") && (
          <FormControlLabel
            sx={{ px: 2, pt: 1 }}
            control={
              <Checkbox
                size="small"
                checked={selectionOnly}
                onChange={(e) => setSelectionOnly(e.target.checked)}
              />
            }
            label="Use selection only"
          />
        )}
        {tab === "generate" && (
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <TextField
              multiline
              minRows={4}
              placeholder="Describe a flowchart…"
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={handleGenerate} disabled={generateBusy}>
              {generateBusy ? "Generating…" : "Generate"}
            </Button>
            {generateError && (
              <Typography variant="body2" sx={{ color: "#f87171" }}>
                {generateError}
              </Typography>
            )}
          </Box>
        )}
        {tab === "chat" && (
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
            <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
              {chatTurns.map((turn, i) => (
                <Box
                  key={i}
                  sx={{
                    alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
                    bgcolor: turn.role === "user" ? "#27272a" : "#1f1f23",
                    px: 1.25,
                    py: 1,
                    borderRadius: 1.5,
                    maxWidth: "95%",
                  }}
                >
                  {turn.role === "user" ? (
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {turn.content}
                    </Typography>
                  ) : (
                    <Typography variant="body2" component="div">
                      <SimpleMarkdown text={turn.content} />
                    </Typography>
                  )}
                  {turn.role === "assistant" && turn.mermaid && !turn.pending && (
                    <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                      <Button size="small" variant="contained" onClick={() => handleApply(i)}>
                        Apply
                      </Button>
                      <Button size="small" onClick={() => handleDiscard(i)}>
                        Discard
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
            <TextField
              placeholder="Ask or request a change…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleChat();
                }
              }}
              disabled={chatBusy}
              fullWidth
            />
          </Box>
        )}
        {tab === "summarize" && (
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Button variant="contained" onClick={handleSummarize} disabled={summarizeBusy}>
              {summarizeBusy ? "Summarizing…" : "Summarize drawing"}
            </Button>
            {summarizeError && (
              <Typography variant="body2" sx={{ color: "#f87171" }}>
                {summarizeError}
              </Typography>
            )}
            {summarizeText && (
              <Typography variant="body2" component="div">
                <SimpleMarkdown text={summarizeText} />
              </Typography>
            )}
          </Box>
        )}
      </>
    );
  }, [
    chatBusy,
    chatInput,
    chatTurns,
    configured,
    generateBusy,
    generateError,
    generatePrompt,
    handleApply,
    handleChat,
    handleDiscard,
    handleGenerate,
    handleSummarize,
    healthError,
    notConfigured,
    selectionOnly,
    summarizeBusy,
    summarizeError,
    summarizeText,
    tab,
  ]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: 380,
            bgcolor: "#161616",
            color: "#ECECEC",
          },
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1.25, borderBottom: "1px solid #2a2a2a" }}>
        <Typography sx={{ fontWeight: 700, flex: 1 }}>AI</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "#A6A6A6" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {body}
    </Drawer>
  );
}
