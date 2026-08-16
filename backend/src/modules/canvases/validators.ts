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

const elementSchema = z.object({
  id: z.string(),
  version: z.number(),
  versionNonce: z.number().optional(),
  // Accept any extra fields from the Excalidraw element shape.
}).passthrough();

export const canvasSyncSchema = z.object({
  elements: z.array(elementSchema).max(5000),
  sceneVersion: z.number(),
  full: z.boolean(),
});

export const presenceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.object({
    background: z.string().max(20),
    stroke: z.string().max(20),
  }),
});