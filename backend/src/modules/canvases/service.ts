import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { hasWorkspaceAccess } from "../workspaces/service.js";
import { HttpError } from "../errors.js";
import { db } from "../../db/index.js";
import {
  canvasDeltas,
  canvases,
  workspaceMembers,
  workspaces,
} from "../../db/schema/index.js";

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

  // Record the highest delta seq this save already includes so a joining
  // client can poll "after" exactly this snapshot.
  const [latest] = await db
    .select({ seq: canvasDeltas.seq })
    .from(canvasDeltas)
    .where(eq(canvasDeltas.canvasId, id))
    .orderBy(desc(canvasDeltas.seq))
    .limit(1);

  const [updated] = await db
    .update(canvases)
    .set({
      content,
      contentSeq: latest?.seq ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(canvases.id, id))
    .returning();

  return updated;
}

export async function appendCanvasDelta(
  id: string,
  userId: string,
  clientId: string,
  payload: unknown
) {
  const canvas = await getCanvasById(id, userId);

  if (!canvas) {
    throw new HttpError(404, "Canvas not found");
  }

  const [delta] = await db
    .insert(canvasDeltas)
    .values({
      canvasId: id,
      clientId,
      payload,
    })
    .returning();

  return delta;
}

export async function getCanvasDeltasAfter(
  id: string,
  userId: string,
  afterSeq: number,
  limit = 500
) {
  const canvas = await getCanvasById(id, userId);

  if (!canvas) {
    throw new HttpError(404, "Canvas not found");
  }

  const deltas = await db
    .select({
      seq: canvasDeltas.seq,
      payload: canvasDeltas.payload,
    })
    .from(canvasDeltas)
    .where(and(eq(canvasDeltas.canvasId, id), gt(canvasDeltas.seq, afterSeq)))
    .orderBy(canvasDeltas.seq)
    .limit(limit);

  const [latest] = await db
    .select({ seq: canvasDeltas.seq })
    .from(canvasDeltas)
    .where(eq(canvasDeltas.canvasId, id))
    .orderBy(desc(canvasDeltas.seq))
    .limit(1);

  return {
    deltas,
    latestSeq: latest?.seq ?? afterSeq,
  };
}