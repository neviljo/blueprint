import { UserIdleState } from "@excalidraw/excalidraw";
import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import type { PresenceMember } from "../lib/api";

export interface CollabColor {
  background: string;
  stroke: string;
}

export interface CollabPointer {
  x: number;
  y: number;
  tool: "pointer" | "laser";
}

/** Payload stored in Ably presence for each connected user. */
export interface PresenceData {
  name: string;
  color: CollabColor;
  pointer: CollabPointer | null;
}

export const COLLAB_COLORS: CollabColor[] = [
  { background: "#f472b6", stroke: "#9d174d" },
  { background: "#60a5fa", stroke: "#1e40af" },
  { background: "#34d399", stroke: "#065f46" },
  { background: "#fbbf24", stroke: "#92400e" },
  { background: "#a78bfa", stroke: "#5b21b6" },
  { background: "#22d3ee", stroke: "#155e75" },
];

/** Deterministic per-user color so the same member always gets the same avatar. */
export function colorForUser(id: string): CollabColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

function pointerToCollaborator(
  pointer: CollabPointer | null | undefined
): Collaborator["pointer"] {
  if (!pointer) return undefined;
  return {
    x: pointer.x,
    y: pointer.y,
    tool: pointer.tool || "pointer",
    renderCursor: true,
  };
}

/** Builds an Excalidraw Collaborator from an Ably presence payload. */
export function collaboratorFromPresenceData(
  clientId: string,
  data: PresenceData
): Collaborator {
  return {
    id: clientId,
    socketId: clientId as SocketId,
    username: data.name,
    color: {
      background: data.color?.background || "#f472b6",
      stroke: data.color?.stroke || "#9d174d",
    },
    pointer: pointerToCollaborator(data.pointer),
    userState: UserIdleState.ACTIVE,
    button: "up",
  };
}

/** Builds an Excalidraw Collaborator from the HTTP presence fallback. */
export function collaboratorFromHttpMember(member: PresenceMember): Collaborator {
  return {
    id: member.userId,
    socketId: member.userId as SocketId,
    username: member.name,
    color: {
      background: member.color?.background || "#a78bfa",
      stroke: member.color?.stroke || "#5b21b6",
    },
    pointer: pointerToCollaborator(member.pointer),
    userState: UserIdleState.ACTIVE,
    button: "up",
  };
}