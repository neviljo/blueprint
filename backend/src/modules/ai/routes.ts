import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { requireAuth } from "../auth/middleware.js";
import { HttpError } from "../errors.js";
import { getAiModels, isAiConfigured } from "./config.js";
import { completeText, streamTextResponse } from "./llm.js";
import { extractMermaid, stripMermaidFences } from "./mermaid.js";
import {
  CHAT_SYSTEM,
  GENERATE_REPAIR_SYSTEM,
  GENERATE_SYSTEM,
  SUMMARIZE_SYSTEM,
} from "./prompts.js";

const router = new Hono();

const diagramSchema = z.object({
  prompt: z.string().min(1),
  repair: z.boolean().optional(),
});

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .min(1),
  dump: z.string().optional(),
});

const summarizeSchema = z.object({
  dump: z.string().min(1),
});

router.get("/health", requireAuth, (c) => {
  return c.json({
    configured: isAiConfigured() && getAiModels().length > 0,
    models: getAiModels(),
  });
});

router.post("/diagram", requireAuth, zValidator("json", diagramSchema), async (c) => {
  const { prompt, repair } = c.req.valid("json");
  const text = await completeText({
    system: repair ? GENERATE_REPAIR_SYSTEM : GENERATE_SYSTEM,
    prompt,
  });
  const mermaid = extractMermaid(text);
  if (!mermaid) {
    throw new HttpError(502, "Model did not return a simple flowchart TD/LR mermaid diagram.");
  }
  return c.json({ mermaid });
});

router.post("/chat", requireAuth, zValidator("json", chatSchema), async (c) => {
  const { messages, dump } = c.req.valid("json");
  const prompt = [
    dump ? `Diagram dump:\n${dump}` : "Diagram dump: (empty)",
    ...messages.map((m) => `${m.role}: ${m.content}`),
  ].join("\n\n");
  const text = await completeText({
    system: CHAT_SYSTEM,
    prompt,
  });
  const mermaid = extractMermaid(text);
  return c.json({
    reply: mermaid ? stripMermaidFences(text) : text.trim(),
    mermaid,
  });
});

router.post("/chat/stream", requireAuth, zValidator("json", chatSchema), async (c) => {
  const { messages, dump } = c.req.valid("json");
  return streamTextResponse({
    system: `${CHAT_SYSTEM}\n\nDiagram dump:\n${dump || "(empty)"}`,
    messages,
  });
});

router.post("/summarize", requireAuth, zValidator("json", summarizeSchema), async (c) => {
  const { dump } = c.req.valid("json");
  const text = await completeText({
    system: SUMMARIZE_SYSTEM,
    prompt: dump,
  });
  return c.json({ reply: text.trim() });
});

router.post("/summarize/stream", requireAuth, zValidator("json", summarizeSchema), async (c) => {
  const { dump } = c.req.valid("json");
  return streamTextResponse({
    system: SUMMARIZE_SYSTEM,
    messages: [{ role: "user", content: dump }],
  });
});

export default router;
