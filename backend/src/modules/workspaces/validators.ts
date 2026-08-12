import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name cannot exceed 100 characters"),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const addMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

