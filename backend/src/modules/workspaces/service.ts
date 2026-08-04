import { db } from "../../db/index.js";
import { workspaces } from "../../db/schema/workspaces.js";
import { canvases } from "../../db/schema/index.js";
import { count, desc, eq, and, getTableColumns } from "drizzle-orm";


export async function createWorkspace(
  name: string,
  ownerId: string
) {
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      ownerId,
    })
    .returning();

  return workspace;
}

export async function getWorkspaces(ownerId: string) {
  return db
    .select({
      ...getTableColumns(workspaces),
      canvasesCount: count(canvases.id),
    })
    .from(workspaces)
    .leftJoin(canvases, eq(canvases.workspaceId, workspaces.id))
    .where(eq(workspaces.ownerId, ownerId))
    .groupBy(workspaces.id)
    .orderBy(desc(workspaces.createdAt));
}
export async function getWorkspaceById(
  id: string,
  ownerId: string
) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.ownerId, ownerId)
      )
    );

  return workspace;
}

export async function updateWorkspace(
  id: string,
  ownerId: string,
  name: string
) {
  const [workspace] = await db
    .update(workspaces)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.ownerId, ownerId)
      )
    )
    .returning();

  return workspace;
}
export async function deleteWorkspace(
  id: string,
  ownerId: string
) {
  const [workspace] = await db
    .delete(workspaces)
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.ownerId, ownerId)
      )
    )
    .returning();

  return workspace;
}

export async function getWorkspaceByIdAndOwner(
  workspaceId: string,
  ownerId: string
) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.ownerId, ownerId)
      )
    );

  return workspace;
}