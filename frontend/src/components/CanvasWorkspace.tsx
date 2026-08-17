import { useState, useEffect, useRef, useCallback } from "react";
import { Box, IconButton, Tooltip, CircularProgress, Avatar, AvatarGroup, Typography, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import Ably from "ably";
import { Excalidraw, CaptureUpdateAction, getSceneVersion, UserIdleState } from "@excalidraw/excalidraw";
import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useNavigate } from "@tanstack/react-router";
import { canvasApi } from "../lib/api";
import type { PresenceMember } from "../lib/api";
import type { CanvasContent } from "../lib/types";
import { getCurrentSession } from "../lib/auth";

interface CanvasWorkspaceProps {
  canvasId: string;
}

interface CollabColor {
  background: string;
  stroke: string;
}

interface CollabPointer {
  x: number;
  y: number;
  tool: "pointer" | "laser";
}

/** Payload stored in Ably presence for each connected user. */
interface PresenceData {
  name: string;
  color: CollabColor;
  pointer: CollabPointer | null;
}

/** Payload broadcast on the canvas channel to sync the scene. */
interface SceneMessage {
  elements: ExcalidrawElement[];
  appState?: {
    theme?: "light" | "dark";
    viewBackgroundColor?: string;
  };
  /** Sender's full scene version (sum of element versions) at publish time. */
  sceneVersion: number;
  /** true = replace the whole scene; false = merge these elements into it. */
  full: boolean;
  /** Present when a large scene is split across multiple messages. */
  chunk?: {
    index: number;
    total: number;
    nonce: string;
  };
}

// Ably caps each published message at 65536 bytes; chunked scene parts use a
// conservative budget so the payload plus protocol overhead stays well under.
const SCENE_CHUNK_BYTES = 32000;

function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/** Splits elements into parts that each stay under the per-message byte budget. */
function splitElements(
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[][] {
  const parts: ExcalidrawElement[][] = [];
  let part: ExcalidrawElement[] = [];
  let partSize = 0;

  for (const element of elements) {
    const elementBytes = byteLength(JSON.stringify(element));
    if (part.length > 0 && partSize + elementBytes > SCENE_CHUNK_BYTES) {
      parts.push(part);
      part = [element];
      partSize = elementBytes;
    } else {
      part.push(element);
      partSize += elementBytes;
    }
  }
  if (part.length > 0) parts.push(part);

  return parts;
}

/** Merges remote delta elements into the local scene, keeping the higher version. */
function mergeSceneElements(
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const byId = new Map<string, ExcalidrawElement>();
  for (const element of local) byId.set(element.id, element);
  for (const element of remote) {
    const existing = byId.get(element.id);
    if (
      !existing ||
      element.version > existing.version ||
      (element.version === existing.version &&
        element.versionNonce > existing.versionNonce)
    ) {
      byId.set(element.id, element);
    }
  }
  return [...byId.values()];
}

const COLLAB_COLORS: CollabColor[] = [
  { background: "#f472b6", stroke: "#9d174d" },
  { background: "#60a5fa", stroke: "#1e40af" },
  { background: "#34d399", stroke: "#065f46" },
  { background: "#fbbf24", stroke: "#92400e" },
  { background: "#a78bfa", stroke: "#5b21b6" },
  { background: "#22d3ee", stroke: "#155e75" },
];

/** Min gap between in-progress scene broadcasts (streams strokes while drawing). */
const SCENE_BROADCAST_THROTTLE_MS = 100;
/** How long to wait after the last change before a final trailing broadcast. */
const SCENE_BROADCAST_DELAY = 250;
/** Minimum interval between pointer presence updates (80ms = 12.5fps smooth WebSocket stream). */
const POINTER_THROTTLE_MS = 80;
/** How long after the pointer stops moving before the cursor is cleared. */
const POINTER_IDLE_CLEAR_MS = 1500;
/** How often to re-broadcast the full scene as a safety net for dropped deltas. */
const FULL_SCENE_RESYNC_MS = 20000;
/** How often to poll the HTTP sync log for remote scene changes when realtime is offline. */
const SCENE_POLL_MS = 2500;
/** How often to send an HTTP presence heartbeat (keeps us marked online). */
const PRESENCE_HEARTBEAT_MS = 10000;
/** Minimum gap between full-scene (force) broadcasts to absorb reconnect bursts. */
const FULL_PUBLISH_COALESCE_MS = 2000;
/** Delay after reconnecting before re-broadcasting the full scene. */
const RECONNECT_RESYNC_DELAY_MS = 1000;
/** Delay before retrying a connection that entered the "failed" state. */
const RECONNECT_DELAY_MS = 3000;

function colorForUser(id: string): CollabColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export default function CanvasWorkspace({ canvasId }: CanvasWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<CanvasContent | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState<"dark" | "light">("dark");
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);
  const [collabStatus, setCollabStatus] = useState<
    "connecting" | "live" | "reconnecting" | "offline"
  >("connecting");
  const isLight = editorTheme === "light";

  const navigate = useNavigate();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSceneBroadcastRef = useRef(0);
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const currentContentRef = useRef<CanvasContent>({
    elements: [],
    appState: { theme: "dark" },
  });
  const loadingRef = useRef(true);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const connectionStateRef = useRef<Ably.ConnectionState>("initialized");
  const myClientIdRef = useRef<string | null>(null);
  const myPresenceRef = useRef<PresenceData | null>(null);
  const currentSceneVersionRef = useRef(0);
  const receivedSceneRef = useRef(false);
  const pendingRemoteSceneRef = useRef<CanvasContent | null>(null);
  const lastPointerPublishRef = useRef(0);
  const pointerIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastedElementVersionsRef = useRef<Map<string, number>>(new Map());
  const resyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFullPublishRef = useRef(0);
  const lastFullSnapshotVersionRef = useRef(-1);
  const lastDeltaSeqRef = useRef(0);
  const syncPollingRef = useRef(false);
  const deltaPostingRef = useRef(false);
  const pendingDeltaRef = useRef<{
    elements: ExcalidrawElement[];
    sceneVersion: number;
    full: boolean;
  } | null>(null);
  const pointerPostingRef = useRef(false);
  const pendingPointerRef = useRef<{
    pointer: { x: number; y: number; tool: "pointer" | "laser" } | null;
  } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const presenceHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectResyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authFailedRef = useRef(false);
  const sceneChunksRef = useRef<
    Map<
      string,
      {
        nonce: string;
        total: number;
        parts: Map<number, ExcalidrawElement[]>;
        appState?: SceneMessage["appState"];
        sceneVersion: number;
        full: boolean;
      }
    >
  >(new Map());

  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());
  const [collaboratorsList, setCollaboratorsList] = useState<Collaborator[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ name: string; color: CollabColor }>({
    name: "You",
    color: COLLAB_COLORS[0],
  });

  const syncCollaboratorsToSceneAndState = useCallback(() => {
    const nextMap = new Map(collaboratorsRef.current);
    excalidrawRef.current?.updateScene({ collaborators: nextMap });
    setCollaboratorsList(Array.from(collaboratorsRef.current.values()));
  }, []);

  // Publishes a scene message, splitting it into chunked parts if it exceeds
  // the per-message byte budget.
  const publishMessage = useCallback((channel: Ably.RealtimeChannel, message: SceneMessage) => {
    const payload = JSON.stringify({
      elements: message.elements,
      appState: message.appState,
      sceneVersion: message.sceneVersion,
      full: message.full,
    });

    if (byteLength(payload) <= SCENE_CHUNK_BYTES) {
      channel
        .publish("scene", message)
        .catch((error) => {
          console.warn("Failed to broadcast scene:", error);
        });
      return;
    }

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const parts = splitElements(message.elements);
    const total = parts.length;

    const publishes = parts.map((partElements, index) => {
      const isLast = index === total - 1;
      return channel.publish("scene", {
        ...message,
        elements: partElements,
        appState: isLast ? message.appState : undefined,
        chunk: { index, total, nonce },
      } satisfies SceneMessage);
    });

    Promise.allSettled(publishes).then((results) => {
      const failed = results.find((r) => r.status === "rejected");
      if (failed) {
        console.warn(
          "Failed to broadcast scene parts:",
          (failed as PromiseRejectedResult).reason
        );
      }
    });
  }, []);

  // Single-flight delta POST queue: at most one request in flight, so rapid
  // drawing on a slow network can't flood the connection. If more changes
  // arrive while a post is pending, only the newest state is sent when the
  // current post resolves (pending elements are merged, keeping the latest
  // version of each, so no changed element is lost).
  const enqueueDelta = useCallback(
    (elements: readonly ExcalidrawElement[], sceneVersion: number, full: boolean) => {
      function postOne(
        els: ExcalidrawElement[],
        sv: number,
        isFull: boolean
      ) {
        deltaPostingRef.current = true;
        canvasApi
          .postDelta(canvasId, { elements: els, sceneVersion: sv, full: isFull })
          .then((res) => {
            if (res.seq > lastDeltaSeqRef.current) {
              lastDeltaSeqRef.current = res.seq;
            }
          })
          .catch((err) => console.warn("Failed to post sync delta:", err))
          .finally(() => {
            deltaPostingRef.current = false;
            const pending = pendingDeltaRef.current;
            pendingDeltaRef.current = null;
            if (pending) {
              postOne(pending.elements, pending.sceneVersion, pending.full);
            }
          });
      }

      if (deltaPostingRef.current) {
        const prev = pendingDeltaRef.current;
        const merged = new Map<string, ExcalidrawElement>();
        if (prev) {
          for (const el of prev.elements) merged.set(el.id, el);
        }
        for (const el of elements) merged.set(el.id, el);
        pendingDeltaRef.current = {
          elements: [...merged.values()],
          sceneVersion,
          full: full || (prev?.full ?? false),
        };
        return;
      }
      postOne([...elements], sceneVersion, full);
    },
    [canvasId]
  );

  // Broadcast local changes. The delta is always POSTed to the HTTP sync log
  // (the reliable source of truth), and also published to Ably as a fast path
  // when the realtime connection is up. `force` sends the whole scene (e.g.
  // on a join or periodic resync).
  const publishScene = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      force = false
    ) => {
      const cleanAppState: SceneMessage["appState"] = {
        theme: appState.theme,
        viewBackgroundColor: appState.viewBackgroundColor,
      };
      const sceneVersion = getSceneVersion(elements);
      const broadcasted = broadcastedElementVersionsRef.current;

      let toSend: ExcalidrawElement[];
      if (force) {
        // Skip redundant full snapshots: only broadcast when the scene version
        // actually changed, and coalesce so reconnect/join/resync bursts can't
        // flood the sync log or Ably's per-connection rate limit.
        if (lastFullSnapshotVersionRef.current === sceneVersion) return;
        lastFullSnapshotVersionRef.current = sceneVersion;
        const now = Date.now();
        if (now - lastFullPublishRef.current < FULL_PUBLISH_COALESCE_MS) return;
        lastFullPublishRef.current = now;

        toSend = [...elements];
        for (const element of toSend) {
          broadcasted.set(element.id, element.version);
        }
      } else {
        toSend = elements.filter((element) => {
          const lastVersion = broadcasted.get(element.id);
          return lastVersion === undefined || element.version > lastVersion;
        });
        if (toSend.length === 0) return;
        for (const element of toSend) {
          broadcasted.set(element.id, element.version);
        }
      }

      const channel = channelRef.current;
      // Only stream over Ably when both the connection and the channel are
      // actually live — publishing into a suspended/detached channel just
      // errors out and spams the console while the socket is flapping.
      const isRealtimeConnected =
        !!channel &&
        channel.state === "attached" &&
        connectionStateRef.current === "connected";

      // Ably fast path — stream live scene deltas instantly over WebSockets
      if (isRealtimeConnected) {
        publishMessage(channel, {
          elements: toSend,
          appState: cleanAppState,
          sceneVersion,
          full: force,
        });
      }

      // HTTP sync log — persistence fallback when realtime is offline or on full snapshot resync
      if (!isRealtimeConnected || force) {
        enqueueDelta(toSend, sceneVersion, force);
      }
    },
    [publishMessage, enqueueDelta]
  );

  // Fetch initial canvas data from backend API
  useEffect(() => {
    async function loadCanvas() {
      try {
        setLoading(true);
        const data = await canvasApi.getById(canvasId);

        let parsedContent: CanvasContent | null = null;
        if (data) {
          if (data.workspaceId) setWorkspaceId(data.workspaceId);
          // Deltas after this snapshot's seq are still missing from it, so
          // polling starts there.
          lastDeltaSeqRef.current = data.contentSeq ?? 0;

          if (data.content && typeof data.content === "string") {
            try {
              parsedContent = JSON.parse(data.content) as CanvasContent;
            } catch {
              parsedContent = null;
            }
          } else if (data.content && typeof data.content === "object") {
            parsedContent = data.content;
          }
        }

        // A fresher scene may have arrived over the realtime channel while we
        // were still loading the persisted copy — prefer that one.
        const remoteScene = pendingRemoteSceneRef.current;
        if (remoteScene) {
          pendingRemoteSceneRef.current = null;
          const scene: CanvasContent = {
            elements: remoteScene.elements,
            appState: { ...remoteScene.appState, viewModeEnabled: false },
          };
          setEditorTheme(
            remoteScene.appState.theme === "light" ? "light" : "dark"
          );
          setInitialData(scene);
          currentContentRef.current = scene;
        } else if (parsedContent) {
          const loadedAppState = { ...(parsedContent.appState || {}) };
          const savedTheme =
            loadedAppState.theme === "light" ? "light" : "dark";
          const scene: CanvasContent = {
            elements: parsedContent.elements || [],
            appState: { ...loadedAppState, viewModeEnabled: false },
          };
          setEditorTheme(savedTheme);
          setInitialData(scene);
          currentContentRef.current = scene;
        } else {
          setEditorTheme("dark");
          const scene: CanvasContent = {
            elements: [],
            appState: { theme: "dark", viewModeEnabled: false },
          };
          setInitialData(scene);
          currentContentRef.current = scene;
        }
      } catch (err) {
        console.warn(
          "Could not fetch canvas data from backend, initializing empty:",
          err
        );
        setEditorTheme("dark");
        const scene: CanvasContent = {
          elements: [],
          appState: { theme: "dark", viewModeEnabled: false },
        };
        setInitialData(scene);
        currentContentRef.current = scene;
      } finally {
        loadingRef.current = false;
        setLoading(false);
        currentSceneVersionRef.current = getSceneVersion(
          currentContentRef.current.elements
        );
        receivedSceneRef.current = true;
      }
    }

    if (canvasId) {
      loadCanvas();
    }
  }, [canvasId]);

  const refreshCollaborators = useCallback(async () => {
    const channel = channelRef.current;
    const myClientId = myClientIdRef.current;
    if (!channel) return;

    // Don't trigger a presence.get() when the channel is suspended/detached —
    // it would hang on a 15s attach timeout that never completes while the
    // socket is flapping. The HTTP presence fallback still covers this.
    if (
      channel.state === "suspended" ||
      channel.state === "failed" ||
      channel.state === "detached"
    ) {
      return;
    }

    try {
      const members = await channel.presence.get();
      collaboratorsRef.current.clear();

      for (const member of members) {
        if (member.clientId === myClientId) continue;

        const data = member.data as PresenceData | undefined;
        if (!data?.name) continue;

        collaboratorsRef.current.set(member.clientId as SocketId, {
          id: member.clientId,
          socketId: member.clientId as SocketId,
          username: data.name,
          color: {
            background: data.color?.background || "#f472b6",
            stroke: data.color?.stroke || "#9d174d",
          },
          pointer: data.pointer
            ? {
                x: data.pointer.x,
                y: data.pointer.y,
                tool: data.pointer.tool || "pointer",
                renderCursor: true,
              }
            : undefined,
          userState: UserIdleState.ACTIVE,
          button: "up",
        });
      }

      syncCollaboratorsToSceneAndState();
    } catch (err) {
      console.warn("Failed to refresh collaborators:", err);
    }
  }, [syncCollaboratorsToSceneAndState]);

  // Set up the Ably realtime connection: presence for live cursors and a
  // channel for scene synchronization between members of the workspace.
  useEffect(() => {
    let disposed = false;

    const handlePresenceMessage = (member: Ably.PresenceMessage) => {
      if (member.clientId === myClientIdRef.current) return;

      const socketId = member.clientId as SocketId;
      if (member.action === "leave" || member.action === "absent") {
        collaboratorsRef.current.delete(socketId);
      } else {
        const data = member.data as PresenceData | undefined;
        if (data?.name) {
          collaboratorsRef.current.set(socketId, {
            id: member.clientId,
            socketId,
            username: data.name,
            color: {
              background: data.color?.background || "#f472b6",
              stroke: data.color?.stroke || "#9d174d",
            },
            pointer: data.pointer
              ? {
                  x: data.pointer.x,
                  y: data.pointer.y,
                  tool: data.pointer.tool || "pointer",
                  renderCursor: true,
                }
              : undefined,
            userState: UserIdleState.ACTIVE,
            button: "up",
          });
        }
      }

      syncCollaboratorsToSceneAndState();
    };

    const handlePresenceJoin = (member: Ably.PresenceMessage) => {
      if (member.clientId === myClientIdRef.current) return;

      handlePresenceMessage(member);
      // Share our in-memory scene (fresher than what the DB may have) so the
      // new member catches up immediately. Receivers ignore stale scenes via
      // the scene-version guard, so broadcasting is safe even if we are not
      // fully synced yet.
      publishScene(
        currentContentRef.current.elements,
        currentContentRef.current.appState,
        true
      );
    };

    const handlePresenceChange = (member: Ably.PresenceMessage) => {
      handlePresenceMessage(member);
    };

    const applyScene = (data: SceneMessage) => {
      // Ignore echoes and stale scenes (older than what we already have).
      if (data.sceneVersion <= currentSceneVersionRef.current) return;

      const appState: SceneMessage["appState"] = {
        theme: data.appState?.theme,
        viewBackgroundColor: data.appState?.viewBackgroundColor,
      };

      // Drop any pending local broadcast so we don't overwrite the fresher
      // remote scene with a stale one.
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
        broadcastTimeoutRef.current = null;
      }

      if (loadingRef.current) {
        // Editor not mounted yet — keep the freshest full scene as the initial
        // scene, merging any deltas that arrive on top of it.
        const pending = pendingRemoteSceneRef.current;
        if (data.full) {
          pendingRemoteSceneRef.current = { elements: data.elements, appState };
        } else if (pending) {
          pending.elements = mergeSceneElements(pending.elements, data.elements);
        }
        receivedSceneRef.current = true;
        return;
      }

      receivedSceneRef.current = true;

      const localElements = currentContentRef.current.elements;
      const nextElements = data.full
        ? data.elements
        : mergeSceneElements(localElements, data.elements);
      currentContentRef.current = {
        elements: nextElements,
        appState: currentContentRef.current.appState,
      };
      currentSceneVersionRef.current = Math.max(
        data.sceneVersion,
        getSceneVersion(nextElements)
      );

      // Mark received elements as "already broadcast" so we don't echo remote
      // changes straight back out. Local edits to the same element get a higher
      // version and are still sent.
      for (const element of data.elements) {
        broadcastedElementVersionsRef.current.set(element.id, element.version);
      }

      excalidrawRef.current?.updateScene({
        elements: nextElements,
        appState: {
          theme: appState.theme ?? "dark",
          viewBackgroundColor:
            appState.viewBackgroundColor ??
            (appState.theme === "light" ? "#ffffff" : "#121212"),
        },
        collaborators: new Map(collaboratorsRef.current),
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      if (appState.theme === "light" || appState.theme === "dark") {
        setEditorTheme(appState.theme);
      }
    };

    const handleSceneMessage = (message: Ably.Message) => {
      const data = message.data as SceneMessage | undefined;
      if (!data || !Array.isArray(data.elements)) return;

      // A scene split across multiple messages: buffer the parts, then apply
      // the assembled scene once every part has arrived.
      if (data.chunk) {
        const sender = message.clientId ?? "unknown";
        const { index, total, nonce } = data.chunk;
        let buffer = sceneChunksRef.current.get(sender);

        if (!buffer || buffer.nonce !== nonce) {
          buffer = {
            nonce,
            total,
            parts: new Map(),
            appState: undefined,
            sceneVersion: data.sceneVersion,
            full: data.full,
          };
          sceneChunksRef.current.set(sender, buffer);
        }

        buffer.parts.set(index, data.elements);
        if (data.appState) buffer.appState = data.appState;

        if (buffer.parts.size < total) return;

        sceneChunksRef.current.delete(sender);

        const assembled: ExcalidrawElement[] = [];
        for (let i = 0; i < total; i++) {
          const part = buffer.parts.get(i);
          if (!part) return;
          assembled.push(...part);
        }

        applyScene({
          elements: assembled,
          appState: buffer.appState ?? {},
          sceneVersion: buffer.sceneVersion,
          full: buffer.full,
        });
        return;
      }

      applyScene(data);
    };

    // Poll the HTTP sync log for remote scene changes. Used as a fallback when
    // the realtime (Ably) channel is disconnected.
    const pollSync = async () => {
      if (disposed || loadingRef.current || syncPollingRef.current) return;
      // When Ably is connected, scene deltas stream via WebSockets instantly;
      // skip making unnecessary HTTP GET requests.
      if (connectionStateRef.current === "connected") return;

      syncPollingRef.current = true;
      try {
        const result = await canvasApi.getDeltas(
          canvasId,
          lastDeltaSeqRef.current
        );
        for (const delta of result.deltas) {
          applyScene({
            elements: delta.elements as ExcalidrawElement[],
            sceneVersion: delta.sceneVersion,
            full: delta.full,
          });
        }
        if (result.latestSeq > lastDeltaSeqRef.current) {
          lastDeltaSeqRef.current = result.latestSeq;
        }
        // Fold presence (avatars + live cursors) into the same round trip.
        updateCollaboratorsFromHttp(result.presence);
      } catch {
        // Transient network/backend hiccup — the next poll will retry.
      } finally {
        syncPollingRef.current = false;
      }
    };

    // HTTP presence: keep us marked online (with our latest pointer) and
    // refresh the collaborator avatar stack. Works independently of Ably, so
    // avatars and cursors appear even when the realtime channel is unreachable.
    const sendPresenceHeartbeat = async () => {
      if (disposed) return;
      const info = myPresenceRef.current;
      if (!info) return;
      try {
        await canvasApi.postPresence(canvasId, {
          name: info.name,
          color: info.color,
          pointer: info.pointer,
        });
      } catch {
        // Transient failure — the next heartbeat retries.
      }
    };

    const updateCollaboratorsFromHttp = (
      members: PresenceMember[]
    ) => {
      if (disposed) return;

      for (const member of members) {
        if (member.userId === myUserIdRef.current) continue;

        const socketId = member.userId as SocketId;
        // Don't overwrite active Ably presence data if already stored
        if (!collaboratorsRef.current.has(socketId)) {
          collaboratorsRef.current.set(socketId, {
            id: member.userId,
            socketId,
            username: member.name,
            color: {
              background: member.color?.background || "#f472b6",
              stroke: member.color?.stroke || "#9d174d",
            },
            pointer: member.pointer
              ? {
                  x: member.pointer.x,
                  y: member.pointer.y,
                  tool: member.pointer.tool || "pointer",
                  renderCursor: true,
                }
              : undefined,
            userState: UserIdleState.ACTIVE,
            button: "up",
          });
        }
      }

      syncCollaboratorsToSceneAndState();
    };

    async function setupRealtime() {
      authFailedRef.current = false;
      setCollabError(null);

      // Re-establish the connection after it entered the terminal "failed"
      // state (Ably only auto-reconnects from disconnected/suspended).
      const scheduleReconnect = (target: Ably.Realtime) => {
        if (disposed || reconnectTimeoutRef.current) return;
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (disposed) return;
          // The SDK auto-reconnects from disconnected/suspended; only force a
          // reconnect if we're actually still stuck in a terminal state.
          const state = connectionStateRef.current;
          if (
            state === "connected" ||
            state === "connecting" ||
            state === "closing" ||
            state === "closed"
          ) {
            return;
          }
          try {
            target.connection.connect();
          } catch (err) {
            console.warn("Failed to reconnect to Ably:", err);
          }
        }, RECONNECT_DELAY_MS);
      };

      let client: Ably.Realtime | null = null;
      try {
        const session = await getCurrentSession();
        const userName =
          session.user?.name || session.user?.email || "Anonymous";
        const userId = session.user?.id || "anonymous";
        const color = colorForUser(userId);

        myUserIdRef.current = userId;

        client = new Ably.Realtime({
          // Token is fetched from our authenticated backend, which verifies
          // the session cookie and scopes the token to this canvas only.
          // echoMessages is off so our own broadcasts aren't re-delivered
          // and re-processed on flaky connections.
          logLevel: 1,
          echoMessages: false,
          // Ably drops connections for operational reasons (autoscaling,
          // rebalancing, deployments) on every plan. The SDK defaults wait
          // 15-30s before reconnecting, which makes realtime feel dead after a
          // drop. Retry fast instead, and enable connection-state recovery so
          // drops resume with message continuity instead of losing the stream.
          disconnectedRetryTimeout: 1500,
          suspendedRetryTimeout: 10000,
          closeOnUnload: false,
          recover: (_details, callback) => callback(true),
          authCallback: (_data, callback) => {
            canvasApi
              .getAblyToken(canvasId)
              .then((tokenRequest) => {
                authFailedRef.current = false;
                callback(null, tokenRequest);
              })
              .catch((error) => {
                authFailedRef.current = true;
                callback(error, null);
              });
          },
        });

        ablyClientRef.current = client;
        myPresenceRef.current = { name: userName, color, pointer: null };
        setCurrentUserInfo({ name: userName, color });
        // Send our initial HTTP presence heartbeat right away so peers see us
        // (and our avatar) even before any realtime connection is established.
        sendPresenceHeartbeat();

        // Track connection state so we never publish into a dead socket, and
        // so peers resync automatically after a drop / reconnect.
        client.connection.on((stateChange) => {
          const state = stateChange.current;
          connectionStateRef.current = state;

          switch (state) {
            case "connected": {
              if (disposed) return;
              setCollabStatus("live");
              setCollabError(null);
              // Fresh connection (initial or after a drop) — refresh the
              // member list and re-broadcast the full scene so peers catch
              // up, slightly delayed so the SDK can reattach first. The
              // publish is coalesced so rapid reconnects can't burst it.
              if (channelRef.current) {
                // Cancel any pending manual reconnect so a stale timer can't
                // force the socket down right after a successful reconnect.
                if (reconnectTimeoutRef.current) {
                  clearTimeout(reconnectTimeoutRef.current);
                  reconnectTimeoutRef.current = null;
                }
                refreshCollaborators();
                if (reconnectResyncTimeoutRef.current) {
                  clearTimeout(reconnectResyncTimeoutRef.current);
                }
                reconnectResyncTimeoutRef.current = setTimeout(() => {
                  reconnectResyncTimeoutRef.current = null;
                  if (disposed) return;
                  publishScene(
                    currentContentRef.current.elements,
                    currentContentRef.current.appState,
                    true
                  );
                }, RECONNECT_RESYNC_DELAY_MS);
              }
              break;
            }
            case "disconnected":
            case "suspended":
              if (disposed) return;
              setCollabStatus("reconnecting");
              break;
            case "failed":
              if (disposed) return;
              if (authFailedRef.current) {
                // Token minting failed — retrying won't help, surface it.
                setCollabStatus("offline");
                setCollabError(
                  "Live cursors are unavailable (realtime connection failed). Scene changes still sync automatically."
                );
              } else {
                // Transient network failure — keep retrying in the background.
                setCollabStatus("reconnecting");
                if (client) scheduleReconnect(client);
              }
              break;
            default:
              break;
          }

          if (stateChange.reason && state !== "connected") {
            console.warn("Ably connection state change:", state, stateChange.reason);
          }
        });

        await client.connection.whenState("connected");

        if (disposed) {
          client.close();
          return;
        }

        myClientIdRef.current = client.clientId;

        const channel = client.channels.get(`canvas:${canvasId}:collab`);
        channelRef.current = channel;

        channel.subscribe("scene", handleSceneMessage);
        channel.presence.subscribe("enter", handlePresenceJoin);
        channel.presence.subscribe("present", handlePresenceJoin);
        channel.presence.subscribe("update", handlePresenceChange);
        channel.presence.subscribe("leave", handlePresenceChange);

        await channel.presence.enter({ name: userName, color, pointer: null });

        if (!disposed) {
          setIsCollaborating(true);
          refreshCollaborators();
          // Periodically re-broadcast the full scene as a safety net for any
          // deltas lost to rate limits or flaky connections.
          resyncIntervalRef.current = setInterval(() => {
            publishScene(
              currentContentRef.current.elements,
              currentContentRef.current.appState,
              true
            );
          }, FULL_SCENE_RESYNC_MS);
        }
      } catch (error) {
        console.warn(
          "Realtime collaboration could not be enabled (is ABLY_API_KEY set on the backend?):",
          error
        );
        if (!disposed) {
          if (authFailedRef.current) {
            setCollabStatus("offline");
            setCollabError(
              "Live cursors are unavailable (realtime connection failed). Scene changes still sync automatically."
            );
          } else if (client) {
            // Transient failure — keep trying instead of giving up.
            setCollabStatus("reconnecting");
            scheduleReconnect(client);
          }
        }
      }
    }

    setupRealtime();

    // Poll the HTTP sync log for remote changes (reliable path — independent
    // of the Ably connection).
    pollTimerRef.current = setInterval(pollSync, SCENE_POLL_MS);
    pollSync();

    // HTTP presence: heartbeat our online status and keep the avatar stack
    // fresh without relying on the realtime channel.
    presenceHeartbeatRef.current = setInterval(
      sendPresenceHeartbeat,
      PRESENCE_HEARTBEAT_MS
    );

    return () => {
      disposed = true;
      setIsCollaborating(false);
      setCollabError(null);
      receivedSceneRef.current = false;
      pendingRemoteSceneRef.current = null;
      broadcastedElementVersionsRef.current.clear();
      sceneChunksRef.current.clear();
      myClientIdRef.current = null;
      myPresenceRef.current = null;

      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (presenceHeartbeatRef.current) {
        clearInterval(presenceHeartbeatRef.current);
        presenceHeartbeatRef.current = null;
      }
      // Mark us offline via HTTP presence so our avatar disappears promptly.
      if (myUserIdRef.current) {
        canvasApi.removePresence(canvasId).catch(() => undefined);
      }
      if (resyncIntervalRef.current) {
        clearInterval(resyncIntervalRef.current);
        resyncIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (reconnectResyncTimeoutRef.current) {
        clearTimeout(reconnectResyncTimeoutRef.current);
        reconnectResyncTimeoutRef.current = null;
      }
      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
        pointerIdleTimeoutRef.current = null;
      }

      const channel = channelRef.current;
      const client = ablyClientRef.current;
      channelRef.current = null;
      ablyClientRef.current = null;

      if (channel) {
        channel.presence.leave().catch(() => undefined);
        channel.unsubscribe();
        channel.detach().catch(() => undefined);
      }
      client?.connection.off();
      client?.close();
    };
  }, [canvasId, publishScene, refreshCollaborators]);

  // Save content to backend API
  const saveCanvasContent = useCallback(
    async (elements: ExcalidrawElement[], appState: Partial<AppState>) => {
      try {
        const cleanAppState: Partial<AppState> = { ...appState };
        delete cleanAppState.collaborators;

        await canvasApi.updateContent(
          canvasId,
          JSON.stringify({
            elements,
            appState: cleanAppState,
          })
        );
      } catch (err) {
        console.warn("Failed to save canvas content to backend:", err);
      }
    },
    [canvasId]
  );

  // Handle canvas drawing changes: debounced realtime broadcast + auto-save
  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState
  ) => {
    currentContentRef.current = {
      elements: [...elements],
      appState,
    };
    currentSceneVersionRef.current = getSceneVersion(elements);

    setEditorTheme(appState.theme === "light" ? "light" : "dark");

    // Only broadcast after we have received a remote scene — otherwise we
    // might overwrite fresher content from members who are already here with
    // stale data loaded from the DB.
    if (receivedSceneRef.current) {
      // Throttle (not debounce) so in-progress strokes stream to peers while
      // they're being drawn; a trailing send flushes the final stroke state.
      const now = Date.now();
      if (now - lastSceneBroadcastRef.current >= SCENE_BROADCAST_THROTTLE_MS) {
        lastSceneBroadcastRef.current = now;
        publishScene(elements, appState);
      } else {
        if (broadcastTimeoutRef.current) {
          clearTimeout(broadcastTimeoutRef.current);
        }
        broadcastTimeoutRef.current = setTimeout(() => {
          broadcastTimeoutRef.current = null;
          lastSceneBroadcastRef.current = Date.now();
          publishScene(elements, appState);
        }, SCENE_BROADCAST_DELAY);
      }
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCanvasContent([...elements], appState);
    }, 1500);
  };

  // Stream pointer position to other members so they can render our live
  // cursor (arrow + name). Always posts to the HTTP presence endpoint so it
  // reaches every peer regardless of connectivity; when the Ably channel is
  // connected it also updates Ably presence for smoother realtime delivery.
  // Flush the latest pointer to the HTTP presence endpoint. Single-flight:
  // at most one POST in flight, so rapid pointer movement on a slow network
  // can't flood the connection — the newest position wins when it resolves.
  const flushPointerPost = useCallback(() => {
    function postOne(pointer: { x: number; y: number; tool: "pointer" | "laser" } | null) {
      const presence = myPresenceRef.current;
      if (!presence) return;
      pointerPostingRef.current = true;
      canvasApi
        .postPresence(canvasId, {
          name: presence.name,
          color: presence.color,
          pointer,
        })
        .catch(() => undefined)
        .finally(() => {
          pointerPostingRef.current = false;
          const pending = pendingPointerRef.current;
          if (pending) {
            pendingPointerRef.current = null;
            postOne(pending.pointer);
          }
        });
    }

    if (pointerPostingRef.current) return;
    const pending = pendingPointerRef.current;
    if (!pending) return;
    pendingPointerRef.current = null;
    postOne(pending.pointer);
  }, [canvasId]);

  const publishPointer = useCallback(
    (pointer: { x: number; y: number; tool: "pointer" | "laser" } | null) => {
      const presence = myPresenceRef.current;
      if (!presence) return;

      const updated: PresenceData = { ...presence, pointer };
      myPresenceRef.current = updated;

      const channel = channelRef.current;
      if (channel && connectionStateRef.current === "connected") {
        // Fast path: stream pointer directly over Ably WebSocket
        channel.presence.update(updated).catch(() => undefined);
      } else {
        // Fallback: flush over HTTP presence only when realtime is disconnected
        pendingPointerRef.current = { pointer };
        flushPointerPost();
      }
    },
    [flushPointerPost]
  );

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const now = Date.now();
      if (now - lastPointerPublishRef.current < POINTER_THROTTLE_MS) return;
      lastPointerPublishRef.current = now;

      publishPointer({
        x: payload.pointer.x,
        y: payload.pointer.y,
        tool: payload.pointer.tool,
      });

      // While actively drawing, stream the in-progress scene straight from
      // pointer movement — a safety net that doesn't rely on onChange's
      // cadence. publishScene dedupes by element version, so repeated calls
      // are no-ops when nothing changed.
      if (payload.button === "down") {
        const elements = excalidrawRef.current?.getSceneElements();
        if (elements) {
          publishScene(elements, currentContentRef.current.appState);
        }
      }

      // Clear the cursor after the pointer goes idle so it fades instead of
      // freezing at the last position.
      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
      }
      pointerIdleTimeoutRef.current = setTimeout(() => {
        pointerIdleTimeoutRef.current = null;
        publishPointer(null);
      }, POINTER_IDLE_CLEAR_MS);
    },
    [publishPointer, publishScene]
  );

  // Capture the Excalidraw imperative API (refs are unsupported since v0.17)
  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = api;
      // Collaboration UI (avatars/cursors) is enabled via HTTP presence —
      // independent of whether the realtime channel ever connects.
      setIsCollaborating(true);
      refreshCollaborators();
    },
    [refreshCollaborators]
  );

  // Toggle the whole editor between light and dark theme
  const handleToggleBackground = useCallback(() => {
    const next: "dark" | "light" = editorTheme === "dark" ? "light" : "dark";
    setEditorTheme(next);
    const appState = currentContentRef.current.appState || {};
    const updatedAppState = { ...appState, theme: next, viewBackgroundColor: "#ffffff" };
    currentContentRef.current.appState = updatedAppState;
    excalidrawRef.current?.updateScene({
      appState: { theme: next, viewBackgroundColor: "#ffffff" },
    });
    saveCanvasContent(currentContentRef.current.elements, updatedAppState);
  }, [editorTheme, saveCanvasContent]);

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#121212",
        color: "#ECECEC",
        overflow: "hidden",
      }}
    >
      {/* Floating Back Button */}
      <Tooltip title="Back to Workspace">
        <IconButton
          onClick={() =>
            workspaceId
              ? navigate({
                  to: "/dashboard/workspaces/$workspaceId",
                  params: { workspaceId },
                })
              : navigate({ to: "/dashboard" })
          }
          sx={{
            position: "absolute",
            top: 16,
            left: 56,
            zIndex: 10,
            color: "#A6A6A6",
            bgcolor: "rgba(18, 18, 18, 0.8)",
            border: "1px solid #1f1f1f",
            "&:hover": { color: "#ECECEC", bgcolor: "#27272A" },
          }}
          size="small"
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Floating Theme Toggle */}
      <Tooltip title={isLight ? "Switch to dark mode" : "Switch to light mode"}>
        <IconButton
          onClick={handleToggleBackground}
          sx={{
            position: "absolute",
            top: 16,
            left: 104,
            zIndex: 10,
            color: "#A6A6A6",
            bgcolor: "rgba(18, 18, 18, 0.8)",
            border: "1px solid #1f1f1f",
            "&:hover": { color: "#ECECEC", bgcolor: "#27272A" },
          }}
          size="small"
        >
          {isLight ? (
            <DarkModeIcon fontSize="small" />
          ) : (
            <LightModeIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>

      {/* Realtime unavailable warning */}
      {collabError && (
        <Box
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            color: "#fbbf24",
            bgcolor: "rgba(18, 18, 18, 0.9)",
            border: "1px solid #3f3f46",
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
            fontSize: "0.8rem",
            maxWidth: 340,
          }}
        >
          {collabError}
        </Box>
      )}

      {/* Online Participants Stack & Realtime Collaboration Indicator */}
      {!collabError && (isCollaborating || collabStatus === "connecting") && (
        <Box
          sx={{
            position: "absolute",
            top: 14,
            right: 16,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            bgcolor: "rgba(18, 18, 18, 0.85)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "24px",
            px: 2,
            py: 0.75,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {/* Status indicator pill */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor:
                  collabStatus === "live"
                    ? "#34d399"
                    : collabStatus === "reconnecting"
                      ? "#fbbf24"
                      : "#f87171",
                boxShadow:
                  collabStatus === "live"
                    ? "0 0 8px #34d399"
                    : "none",
              }}
            />
            <Typography variant="caption" sx={{ color: "#ECECEC", fontWeight: 600, fontSize: "0.75rem" }}>
              {collabStatus === "live"
                ? `${collaboratorsList.length + 1} Online`
                : collabStatus === "reconnecting"
                  ? "Reconnecting…"
                  : "Connecting…"}
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.15)", my: 0.25 }} />

          {/* Active Collaborators Avatars */}
          <AvatarGroup
            max={5}
            sx={{
              "& .MuiAvatar-root": {
                width: 28,
                height: 28,
                fontSize: "0.75rem",
                fontWeight: 700,
                border: "2px solid #121212",
              },
            }}
          >
            {/* Self Avatar */}
            <Tooltip title={`${currentUserInfo.name} (You)`} arrow placement="bottom">
              <Avatar
                sx={{
                  bgcolor: currentUserInfo.color.background,
                  color: "#ffffff",
                  outline: `2px solid ${currentUserInfo.color.stroke}`,
                }}
              >
                {(currentUserInfo.name || "U").charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>

            {/* Remote Collaborators Avatars */}
            {collaboratorsList.map((collab) => (
              <Tooltip
                key={collab.id || collab.username}
                title={
                  <Box sx={{ p: 0.25 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>
                      {collab.username}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#a1a1aa", fontSize: "0.7rem", display: "block" }}>
                      {collab.pointer ? "Active on canvas" : "Online"}
                    </Typography>
                  </Box>
                }
                arrow
                placement="bottom"
              >
                <Avatar
                  sx={{
                    bgcolor: collab.color?.background || "#a78bfa",
                    color: "#ffffff",
                    outline: `2px solid ${collab.color?.stroke || "#5b21b6"}`,
                    cursor: "pointer",
                    transition: "transform 0.15s ease",
                    "&:hover": {
                      transform: "scale(1.15)",
                      zIndex: 100,
                    },
                  }}
                >
                  {(collab.username || "A").charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        </Box>
      )}

      {/* Main Canvas Viewport */}
      <Box sx={{ flexGrow: 1, width: "100%", height: "100%", position: "relative" }}>
        {loading ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 2,
            }}
          >
            <CircularProgress size={40} sx={{ color: "#ECECEC" }} />
            <Box sx={{ color: "#A6A6A6", fontSize: "0.875rem" }}>
              Loading Excalidraw Whiteboard...
            </Box>
          </Box>
        ) : (
          <Excalidraw
            excalidrawAPI={handleExcalidrawAPI}
            theme={editorTheme}
            initialData={initialData}
            onChange={handleChange}
            onPointerUpdate={handlePointerUpdate}
            isCollaborating={isCollaborating}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: true,
                clearCanvas: true,
              },
            }}
          />
        )}
      </Box>
    </Box>
  );
}
