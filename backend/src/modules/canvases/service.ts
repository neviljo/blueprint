import { and, desc, eq, inArray, or } from "drizzle-orm";
import { hasWorkspaceAccess } from "../workspaces/service.js";
import { HttpError } from "../errors.js";
import { db } from "../../db/index.js";
import { canvases, workspaceMembers, workspaces } from "../../db/schema/index.js";

async function assertWorkspaceAccess(workspaceId: string, userId: string) {
  const workspace = await hasWorkspaceAccess(workspaceId, userId);

  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }
}

export async function createCanvas(
  name: string,
  workspaceId: string,
  userId: string
) {
  await assertWorkspaceAccess(workspaceId, userId);

  const [canvas] = await db
    .insert(canvases)
    .values({
      name,
      workspaceId,
    })
    .returning();

  return canvas;
}

export async function getCanvasesByWorkspace(workspaceId: string, userId: string) {
  await assertWorkspaceAccess(workspaceId, userId);

  return db
    .select()
    .from(canvases)
    .where(eq(canvases.workspaceId, workspaceId))
    .orderBy(desc(canvases.createdAt));
}

function memberWorkspaceIds(userId: string) {
  return db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
}

export async function getCanvasById(id: string, userId: string) {
  const [result] = await db
    .select()
    .from(workspaces)
    .innerJoin(canvases, eq(workspaces.id, canvases.workspaceId))
    .where(
      and(
        eq(canvases.id, id),
        or(
          eq(workspaces.ownerId, userId),
          inArray(workspaces.id, memberWorkspaceIds(userId))
        )
      )
    );

  return result?.canvases;
}

export async function updateCanvas(id: string, userId: string, name: string) {
  const canvas = await getCanvasById(id, userId);

  if (!canvas) {
    return null;
  }

  const [updated] = await db
    .update(canvases)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(eq(canvases.id, id))
    .returning();

  return updated;
}

export async function deleteCanvas(id: string, userId: string) {
  const canvas = await getCanvasById(id, userId);

  if (!canvas) {
    return null;
  }

  const [deleted] = await db
    .delete(canvases)
    .where(eq(canvases.id, id))
    .returning();

  return deleted;
}

export async function updateCanvasContent(id: string, userId: string, content: string) {
  const canvas = await getCanvasById(id, userId);

  if (!canvas) {
    return null;
  }

  const [updated] = await db
    .update(canvases)
    .set({
      content,
      updatedAt: new Date(),
    })
    .where(eq(canvases.id, id))
    .returning();

  return updated;
}