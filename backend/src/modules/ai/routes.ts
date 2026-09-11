import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { requireAuth } from "../auth/middleware.js";
import { HttpError } from "../errors.js";
import { getAiModels, isAiConfigured } from "./config.js";
import { completeText, streamCompletion } from "./llm.js";
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

function sseHeaders() {
  return {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

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
  const composed = [
    dump ? `Diagram dump:\n${dump}` : "Diagram dump: (empty)",
    ...messages.map((m) => `${m.role}: ${m.content}`),
  ].join("\n\n");

  return streamSSE(c, async (stream) => {
    try {
      const full = await streamCompletion({
        system: CHAT_SYSTEM,
        messages: [{ role: "user", content: composed }],
        onToken: async (text) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "token", text }),
          });
        },
      });
      const mermaid = extractMermaid(full);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          reply: mermaid ? stripMermaidFences(full) : full.trim(),
          mermaid,
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Stream failed";
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", detail }),
      });
    }
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
  c.header("Cache-Control", sseHeaders()["Cache-Control"]);

  return streamSSE(c, async (stream) => {
    try {
      const full = await streamCompletion({
        system: SUMMARIZE_SYSTEM,
        messages: [{ role: "user", content: dump }],
        onToken: async (text) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "token", text }),
          });
        },
      });
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          reply: full.trim(),
          mermaid: null,
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Stream failed";
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", detail }),
      });
    }
  });
});

export default router;
