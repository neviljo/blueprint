import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { requireAuth } from "../auth/middleware.js";
import { HttpError } from "../errors.js";
import {
  getAiModels,
  getAiProvider,
  isAiConfigured,
  isProviderConfigured,
} from "./config.js";
import { completeText, startTextStream } from "./llm.js";
import { extractMermaid, stripMermaidFences } from "./mermaid.js";
import {
  CHAT_SYSTEM,
  GENERATE_REPAIR_SYSTEM,
  GENERATE_SYSTEM,
  SUMMARIZE_SYSTEM,
} from "./prompts.js";

const router = new Hono();

const providerSchema = z.enum(["google", "groq", "gemini"]).optional();

const diagramSchema = z.object({
  prompt: z.string().min(1),
  repair: z.boolean().optional(),
  useSearch: z.boolean().optional(),
  provider: providerSchema,
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
  useSearch: z.boolean().optional(),
  provider: providerSchema,
});

const summarizeSchema = z.object({
  dump: z.string().min(1),
  provider: providerSchema,
});

router.get("/health", requireAuth, (c) => {
  const google = isProviderConfigured("google") && getAiModels("google").length > 0;
  const groq = isProviderConfigured("groq") && getAiModels("groq").length > 0;
  return c.json({
    configured: isAiConfigured() && (google || groq),
    provider: getAiProvider(),
    providers: { google, groq },
    models: getAiModels(),
  });
});

router.post("/diagram", requireAuth, zValidator("json", diagramSchema), async (c) => {
  const { prompt, repair, provider } = c.req.valid("json");
  const text = await completeText({
    system: repair ? GENERATE_REPAIR_SYSTEM : GENERATE_SYSTEM,
    prompt,
    provider,
  });
  const mermaid = extractMermaid(text);
  if (!mermaid) {
    throw new HttpError(502, "Model did not return a simple flowchart TD/LR mermaid diagram.");
  }
  return c.json({ mermaid });
});

router.post("/chat", requireAuth, zValidator("json", chatSchema), async (c) => {
  const { messages, dump, provider } = c.req.valid("json");
  const prompt = [
    dump ? `Diagram dump:\n${dump}` : "Diagram dump: (empty)",
    ...messages.map((m) => `${m.role}: ${m.content}`),
  ].join("\n\n");
  const text = await completeText({
    system: CHAT_SYSTEM,
    prompt,
    provider,
  });
  const mermaid = extractMermaid(text);
  return c.json({
    reply: mermaid ? stripMermaidFences(text) : text.trim(),
    mermaid,
  });
});

router.post("/chat/stream", requireAuth, zValidator("json", chatSchema), async (c) => {
  const { messages, dump, provider } = c.req.valid("json");
  const result = await startTextStream({
    system: `${CHAT_SYSTEM}\n\nDiagram dump:\n${dump || "(empty)"}`,
    messages,
    provider,
  });
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    for await (const delta of result.textStream) {
      await stream.writeSSE({ data: JSON.stringify(delta) });
    }
  });
});

router.post("/summarize", requireAuth, zValidator("json", summarizeSchema), async (c) => {
  const { dump, provider } = c.req.valid("json");
  const text = await completeText({
    system: SUMMARIZE_SYSTEM,
    prompt: dump,
    allowTools: false,
    provider,
  });
  return c.json({ reply: text.trim() });
});

router.post("/summarize/stream", requireAuth, zValidator("json", summarizeSchema), async (c) => {
  const { dump, provider } = c.req.valid("json");
  const result = await startTextStream({
    system: SUMMARIZE_SYSTEM,
    messages: [{ role: "user", content: dump }],
    allowTools: false,
    provider,
  });
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    for await (const delta of result.textStream) {
      await stream.writeSSE({ data: JSON.stringify(delta) });
    }
  });
});

export default router;
