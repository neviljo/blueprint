import { and, desc, eq } from "drizzle-orm";
import { getWorkspaceByIdAndOwner } from "../workspaces/service.js";
import { HttpError } from "../errors.js";
import { db } from "../../db/index.js";
import { canvases, workspaces } from "../../db/schema/index.js";

async function assertWorkspaceOwnership(workspaceId: string, ownerId: string) {
  const workspace = await getWorkspaceByIdAndOwner(workspaceId, ownerId);

  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }
}

export async function createCanvas(
  name: string,
  workspaceId: string,
  ownerId: string
) {
  await assertWorkspaceOwnership(workspaceId, ownerId);

  const [canvas] = await db
    .insert(canvases)
    .values({
      name,
      workspaceId,
    })
    .returning();

  return canvas;
}

export async function getCanvasesByWorkspace(workspaceId: string, ownerId: string) {
  await assertWorkspaceOwnership(workspaceId, ownerId);

  return db
    .select()
    .from(canvases)
    .where(eq(canvases.workspaceId, workspaceId))
    .orderBy(desc(canvases.createdAt));
}
export async function getCanvasById(
  id: string,
  ownerId: string
) {
  const workspace = db
    .select()
    .from(workspaces)
    .innerJoin(
      canvases,
      eq(workspaces.id, canvases.workspaceId)
    )
    .where(
      and(
        eq(canvases.id, id),
        eq(workspaces.ownerId, ownerId)
      )
    );

  const [result] = await workspace;

  return result?.canvases;
}

export async function updateCanvas(
  id: string,
  ownerId: string,
  name: string
) {
  const canvas = await getCanvasById(id, ownerId);

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
export async function deleteCanvas(
  id: string,
  ownerId: string
) {
  const canvas = await getCanvasById(id, ownerId);

  if (!canvas) {
    return null;
  }

  const [deleted] = await db
    .delete(canvases)
    .where(eq(canvases.id, id))
    .returning();

  return deleted;
}

export async function updateCanvasContent(
  id: string,
  ownerId: string,
  content: string
) {
  const canvas = await getCanvasById(id, ownerId);

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