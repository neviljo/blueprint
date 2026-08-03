import { z } from "zod";

export const createCanvasSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Canvas name is required")
    .max(100),

  workspaceId: z.uuid(),
});

export const updateCanvasSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100),
});

export const updateCanvasContentSchema = z.object({
  content: z.string(),
});