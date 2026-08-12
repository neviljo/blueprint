import { and, asc, count, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { canvases, user } from "../../db/schema/index.js";
import { workspaces } from "../../db/schema/workspaces.js";
import { workspaceMembers } from "../../db/schema/workspaceMembers.js";
import { HttpError } from "../errors.js";

function memberWorkspaceIds(userId: string) {
  return db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
}

export async function createWorkspace(name: string, ownerId: string) {
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      ownerId,
    })
    .returning();

  return workspace;
}

export async function getWorkspaces(userId: string) {
  return db
    .select({
      ...getTableColumns(workspaces),
      canvasesCount: count(canvases.id),
      isOwner: sql<boolean>`${workspaces.ownerId} = ${userId}`,
    })
    .from(workspaces)
    .leftJoin(canvases, eq(canvases.workspaceId, workspaces.id))
    .where(
      or(
        eq(workspaces.ownerId, userId),
        inArray(workspaces.id, memberWorkspaceIds(userId))
      )
    )
    .groupBy(workspaces.id)
    .orderBy(desc(workspaces.createdAt));
}

export async function getWorkspaceById(id: string, userId: string) {
  const workspace = await db
    .select({
      ...getTableColumns(workspaces),
      isOwner: sql<boolean>`${workspaces.ownerId} = ${userId}`,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, id),
        or(
          eq(workspaces.ownerId, userId),
          inArray(workspaces.id, memberWorkspaceIds(userId))
        )
      )
    );

  return workspace[0];
}

export async function updateWorkspace(id: string, ownerId: string, name: string) {
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

export async function deleteWorkspace(id: string, ownerId: string) {
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

export async function hasWorkspaceAccess(id: string, userId: string) {
  const workspace = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, id),
        or(
          eq(workspaces.ownerId, userId),
          inArray(workspaces.id, memberWorkspaceIds(userId))
        )
      )
    );

  return workspace[0];
}

export interface WorkspaceMemberRow {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: "owner" | "member";
  addedAt: Date | null;
}

async function assertWorkspaceOwner(id: string, ownerId: string) {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.ownerId, ownerId)
      )
    );

  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }
}

export async function getWorkspaceMembers(
  workspaceId: string,
  ownerId: string
): Promise<WorkspaceMemberRow[]> {
  await assertWorkspaceOwner(workspaceId, ownerId);

  const [owner] = await db
    .select({
      userId: workspaces.ownerId,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(workspaces)
    .innerJoin(user, eq(workspaces.ownerId, user.id))
    .where(eq(workspaces.id, workspaceId));

  const memberRows = await db
    .select({
      userId: workspaceMembers.userId,
      name: user.name,
      email: user.email,
      image: user.image,
      addedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));

  const rows: WorkspaceMemberRow[] = [];
  if (owner) {
    rows.push({
      userId: owner.userId,
      name: owner.name,
      email: owner.email,
      image: owner.image,
      role: "owner",
      addedAt: null,
    });
  }
  rows.push(
    ...memberRows.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      image: m.image,
      role: "member" as const,
      addedAt: m.addedAt,
    }))
  );

  return rows;
}

export async function addWorkspaceMember(
  workspaceId: string,
  ownerId: string,
  email: string
): Promise<WorkspaceMemberRow> {
  await assertWorkspaceOwner(workspaceId, ownerId);

  const [targetUser] = await db
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`);

  if (!targetUser) {
    throw new HttpError(404, "No user account found for this email");
  }

  if (targetUser.id === ownerId) {
    throw new HttpError(400, "You own this workspace");
  }

  const [existing] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, targetUser.id)
      )
    );

  if (existing) {
    throw new HttpError(409, "Already a member");
  }

  const [row] = await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId: targetUser.id })
    .returning();

  return {
    userId: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    image: targetUser.image,
    role: "member",
    addedAt: row.createdAt,
  };
}

export async function removeWorkspaceMember(
  workspaceId: string,
  ownerId: string,
  userId: string
) {
  await assertWorkspaceOwner(workspaceId, ownerId);

  const [row] = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .returning();

  return row;
}