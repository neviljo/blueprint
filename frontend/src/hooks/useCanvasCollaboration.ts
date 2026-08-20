import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import Ably from "ably";
import { getSceneVersion, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasApi } from "../lib/api";
import type { PresenceMember } from "../lib/api";
import { getCurrentSession } from "../lib/auth";
import type { CanvasContent } from "../lib/types";
import {
  SCENE_CHUNK_BYTES,
  SceneChunkAssembler,
  cleanSceneAppState,
  mergeSceneElements,
  scenePayloadBytes,
  splitElements,
} from "../collab/sceneSync";
import type { SceneMessage } from "../collab/sceneSync";
import {
  COLLAB_COLORS,
  collaboratorFromHttpMember,
  collaboratorFromPresenceData,
  colorForUser,
} from "../collab/presence";
import type {
  CollabColor,
  CollabPointer,
  PresenceData,
} from "../collab/presence";
import type { RemoteScene } from "./useCanvasData";

export type CollabStatus = "connecting" | "live" | "reconnecting" | "offline";

export interface CanvasCollaborationDeps {
  contentRef: RefObject<CanvasContent>;
  sceneVersionRef: RefObject<number>;
  lastDeltaSeqRef: RefObject<number>;
  pendingRemoteSceneRef: RefObject<RemoteScene | null>;
  receivedSceneRef: RefObject<boolean>;
  loadingRef: RefObject<boolean>;
  excalidrawRef: RefObject<ExcalidrawImperativeAPI | null>;
  setTheme: (theme: "light" | "dark") => void;
  saveCanvasContent: (
    elements: ExcalidrawElement[],
    appState: Partial<AppState>
  ) => Promise<void>;
  flushPendingSave: () => void;
}

export interface CanvasCollaboration {
  isCollaborating: boolean;
  collabStatus: CollabStatus;
  collabError: string | null;
  currentUserInfo: { name: string; color: CollabColor };
  collaboratorsList: Collaborator[];
  /** Throttled + trailing-drain broadcast of local scene changes to peers. */
  broadcastLocalScene: (
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>
  ) => void;
  /** Re-reads the Ably presence member list into the collaborator map. */
  refreshCollaborators: () => Promise<void>;
  /** Throttled pointer broadcast (Ably fast path + HTTP presence fallback). */
  handlePointerUpdate: (payload: {
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    button: "down" | "up";
  }) => void;
  setIsCollaborating: Dispatch<SetStateAction<boolean>>;
}

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

/**
 * Owns everything that keeps this canvas in sync with other members:
 * - Ably connection + channel lifecycle (canvas:${canvasId}:collab)
 * - scene delta / full-snapshot publishing + receiving (with chunking)
 * - presence (Ably + HTTP fallback), live cursors, avatars, join/leave
 * - HTTP sync-log polling when realtime is not genuinely usable
 * - reconnection, offline/online + visibility handling, cleanup
 *
 * The internal effect depends ONLY on canvasId. Every callback it needs is
 * stashed into refs so React re-renders can never tear down and recreate the
 * Ably connection (StrictMode included). All functions returned from this hook
 * are stable per canvasId.
 */
export function useCanvasCollaboration(
  canvasId: string,
  deps: CanvasCollaborationDeps
): CanvasCollaboration {
  const {
    contentRef,
    sceneVersionRef,
    lastDeltaSeqRef,
    pendingRemoteSceneRef,
    receivedSceneRef,
    loadingRef,
    excalidrawRef,
    setTheme,
    saveCanvasContent,
    flushPendingSave,
  } = deps;

  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);
  const [collabStatus, setCollabStatus] = useState<CollabStatus>("connecting");
  const [collaboratorsList, setCollaboratorsList] = useState<Collaborator[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<{
    name: string;
    color: CollabColor;
  }>({
    name: "You",
    color: COLLAB_COLORS[0],
  });

  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const connectionStateRef = useRef<Ably.ConnectionState>("initialized");
  const myClientIdRef = useRef<string | null>(null);
  const myPresenceRef = useRef<PresenceData | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const authFailedRef = useRef(false);
  const isOnlineRef = useRef(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const broadcastedElementVersionsRef = useRef<Map<string, number>>(new Map());
  const lastSceneBroadcastRef = useRef(0);
  const broadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerPublishRef = useRef(0);
  const pointerIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const resyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFullPublishRef = useRef(0);
  const lastFullSnapshotVersionRef = useRef(-1);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Single-flight HTTP queues (delta posts + pointer posts).
  const syncPollingRef = useRef(false);
  const deltaPostingRef = useRef(false);
  const pendingDeltaRef = useRef<{
    elements: ExcalidrawElement[];
    sceneVersion: number;
    full: boolean;
  } | null>(null);
  const pointerPostingRef = useRef(false);
  const pendingPointerRef = useRef<{
    pointer: CollabPointer | null;
  } | null>(null);

  const chunkAssemblerRef = useRef(new SceneChunkAssembler());

  const syncCollaboratorsToSceneAndState = useCallback(() => {
    const nextMap = new Map(collaboratorsRef.current);
    excalidrawRef.current?.updateScene({ collaborators: nextMap });
    setCollaboratorsList(Array.from(collaboratorsRef.current.values()));
  }, [excalidrawRef]);

  // Publishes a scene message, splitting it into chunked parts if it exceeds
  // the per-message byte budget.
  const publishMessage = useCallback(
    (channel: Ably.RealtimeChannel, message: SceneMessage) => {
      if (scenePayloadBytes(message) <= SCENE_CHUNK_BYTES) {
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
    },
    []
  );

  // Single-flight delta POST queue: at most one request in flight, so rapid
  // drawing on a slow network can't flood the backend. If more changes arrive
  // while a post is pending, only the newest state is sent when the current
  // post resolves (pending elements are merged, keeping the latest version of
  // each, so no changed element is lost).
  const enqueueDelta = useCallback(
    (elements: readonly ExcalidrawElement[], sceneVersion: number, full: boolean) => {
      function postOne(
        els: ExcalidrawElement[],
        sv: number,
        isFull: boolean
      ) {
        if (!isOnlineRef.current || document.hidden) return;
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
    [canvasId, lastDeltaSeqRef]
  );

  // Realtime is only truly usable when the Ably CHANNEL is attached (not just
  // the connection being "connected" — the channel can be suspended while the
  // connection looks fine). Every realtime fast-path and every HTTP fallback
  // gate on this so collab degrades gracefully instead of silently dying.
  const isRealtimeActive = useCallback(
    () =>
      !!channelRef.current &&
      channelRef.current.state === "attached" &&
      connectionStateRef.current === "connected",
    []
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
      const cleanAppState = cleanSceneAppState(appState);
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
      const isRealtimeConnected = isRealtimeActive();

      // Ably fast path — stream live scene deltas instantly over WebSockets.
      if (isRealtimeConnected && channel) {
        publishMessage(channel, {
          elements: toSend,
          appState: cleanAppState,
          sceneVersion,
          full: force,
        });
      }

      // HTTP sync log — persistence fallback when realtime is offline or on
      // full snapshot resync.
      if (!isRealtimeConnected || force) {
        enqueueDelta(toSend, sceneVersion, force);
      }
    },
    [publishMessage, enqueueDelta, isRealtimeActive]
  );

  // Throttle (not debounce) so in-progress strokes stream to peers while
  // they're being drawn; a trailing send flushes the final stroke state.
  const broadcastLocalScene = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>
    ) => {
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
    },
    [publishScene]
  );

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

        collaboratorsRef.current.set(
          member.clientId as SocketId,
          collaboratorFromPresenceData(member.clientId, data)
        );
      }

      syncCollaboratorsToSceneAndState();
    } catch (err) {
      console.warn("Failed to refresh collaborators:", err);
    }
  }, [syncCollaboratorsToSceneAndState]);

  // Flush the latest pointer to the HTTP presence endpoint. Single-flight: at
  // most one POST in flight, so rapid pointer movement on a slow network can't
  // flood the connection — the newest position wins when it resolves.
  const flushPointerPost = useCallback(() => {
    function postOne(pointer: CollabPointer | null) {
      const presence = myPresenceRef.current;
      if (!presence) return;
      if (!isOnlineRef.current || document.hidden) return;
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
    (pointer: CollabPointer | null) => {
      const presence = myPresenceRef.current;
      if (!presence) return;

      const updated: PresenceData = { ...presence, pointer };
      myPresenceRef.current = updated;

      const channel = channelRef.current;
      if (channel && isRealtimeActive()) {
        // Fast path: stream pointer directly over Ably WebSocket.
        channel.presence.update(updated).catch(() => undefined);
      } else {
        // Fallback: flush over HTTP presence when the Ably channel isn't
        // attached (connection "connected" but channel suspended still lands
        // here, so cursors keep flowing over HTTP instead of dying silently).
        pendingPointerRef.current = { pointer };
        flushPointerPost();
      }
    },
    [flushPointerPost, isRealtimeActive]
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
          publishScene(elements, contentRef.current.appState);
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
    [publishPointer, publishScene, excalidrawRef, contentRef]
  );

  // Callbacks the Ably effect needs are held in refs and read through
  // `.current` so the effect's only dependency is canvasId.
  const publishSceneRef = useRef(publishScene);
  const refreshCollaboratorsRef = useRef(refreshCollaborators);
  const isRealtimeActiveRef = useRef(isRealtimeActive);
  const syncCollaboratorsToSceneAndStateRef = useRef(
    syncCollaboratorsToSceneAndState
  );
  const saveCanvasContentRef = useRef(saveCanvasContent);
  const flushPendingSaveRef = useRef(flushPendingSave);
  const setThemeRef = useRef(setTheme);

  // Set up the Ably realtime connection: presence for live cursors and a
  // channel for scene synchronization between members of the workspace.
  // The effect depends ONLY on canvasId — every realtime callback is accessed
  // through a ref (see above) so React re-renders can never tear down and
  // recreate the connection.
  useEffect(() => {
    let disposed = false;
    console.log(`[ABLY] effect setup (canvasId=${canvasId})`);

    // Stable non-DOM objects captured so the cleanup can reset them without
    // reading refs that React's lint flags as "likely changed".
    const broadcastedVersions = broadcastedElementVersionsRef.current;
    const chunkAssembler = chunkAssemblerRef.current;

    // Keep the callback refs pointed at the latest identity. These only change
    // when canvasId changes (which re-runs this effect), so assigning here is
    // always in sync with the closure below.
    publishSceneRef.current = publishScene;
    refreshCollaboratorsRef.current = refreshCollaborators;
    isRealtimeActiveRef.current = isRealtimeActive;
    syncCollaboratorsToSceneAndStateRef.current = syncCollaboratorsToSceneAndState;
    saveCanvasContentRef.current = saveCanvasContent;
    flushPendingSaveRef.current = flushPendingSave;
    setThemeRef.current = setTheme;

    // Track network connectivity and tab visibility so we can pause HTTP
    // fallback traffic (polls/heartbeats/saves) while the connection is dead
    // and flush anything queued the moment it recovers.
    isOnlineRef.current = navigator.onLine;
    const handleOnline = () => {
      isOnlineRef.current = true;
      setCollabStatus((prev) => (prev === "offline" ? "reconnecting" : prev));
      flushPendingSaveRef.current();
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
    };
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      // Tab visible again — push anything we paused while hidden.
      flushPendingSaveRef.current();
      pollSync();
      sendPresenceHeartbeat();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handlePresenceMessage = (member: Ably.PresenceMessage) => {
      if (member.clientId === myClientIdRef.current) return;

      const socketId = member.clientId as SocketId;
      if (member.action === "leave" || member.action === "absent") {
        collaboratorsRef.current.delete(socketId);
      } else {
        const data = member.data as PresenceData | undefined;
        if (data?.name) {
          collaboratorsRef.current.set(
            socketId,
            collaboratorFromPresenceData(member.clientId, data)
          );
        }
      }

      syncCollaboratorsToSceneAndStateRef.current();
    };

    const handlePresenceJoin = (member: Ably.PresenceMessage) => {
      if (member.clientId === myClientIdRef.current) return;

      handlePresenceMessage(member);
      // Share our in-memory scene (fresher than what the DB may have) so the
      // new member catches up immediately. Receivers ignore stale scenes via
      // the scene-version guard, so broadcasting is safe even if we are not
      // fully synced yet.
      publishSceneRef.current(
        contentRef.current.elements,
        contentRef.current.appState,
        true
      );
    };

    const handlePresenceChange = (member: Ably.PresenceMessage) => {
      handlePresenceMessage(member);
    };

    const applyScene = (data: SceneMessage) => {
      // Ignore echoes and stale scenes (older than what we already have).
      if (data.sceneVersion <= sceneVersionRef.current) return;

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

      const localElements = contentRef.current.elements;
      const nextElements = data.full
        ? data.elements
        : mergeSceneElements(localElements, data.elements);
      contentRef.current = {
        elements: nextElements,
        appState: contentRef.current.appState,
      };
      sceneVersionRef.current = Math.max(
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
        setThemeRef.current(appState.theme);
      }
    };

    const handleSceneMessage = (message: Ably.Message) => {
      const data = message.data as SceneMessage | undefined;
      if (!data || !Array.isArray(data.elements)) return;

      // A scene split across multiple messages: buffer the parts, then apply
      // the assembled scene once every part has arrived.
      if (data.chunk) {
        const sender = message.clientId ?? "unknown";
        const assembled = chunkAssemblerRef.current.accept(sender, data);
        if (!assembled) return;
        applyScene(assembled);
        return;
      }

      applyScene(data);
    };

    // Poll the HTTP sync log for remote scene changes. Used as a fallback when
    // the realtime (Ably) channel is disconnected.
    const pollSync = async () => {
      if (disposed || loadingRef.current || syncPollingRef.current) return;
      // Don't hammer a dead connection while the network is down or the tab
      // is hidden — poll again as soon as we're online/visible.
      if (!isOnlineRef.current || document.hidden) return;
      // Skip HTTP polling only when realtime is genuinely active (channel
      // attached) — the connection can say "connected" while the channel is
      // suspended, in which case Ably isn't delivering anything and we MUST
      // keep polling the sync log or the canvas stops updating.
      if (isRealtimeActiveRef.current()) return;

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
      if (!isOnlineRef.current || document.hidden) return;
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

    const updateCollaboratorsFromHttp = (members: PresenceMember[]) => {
      if (disposed) return;

      for (const member of members) {
        if (member.userId === myUserIdRef.current) continue;

        const socketId = member.userId as SocketId;
        // Don't overwrite active Ably presence data if already stored.
        if (!collaboratorsRef.current.has(socketId)) {
          collaboratorsRef.current.set(
            socketId,
            collaboratorFromHttpMember(member)
          );
        }
      }

      syncCollaboratorsToSceneAndStateRef.current();
    };

    async function setupRealtime() {
      authFailedRef.current = false;
      setCollabError(null);

      try {
        const session = await getCurrentSession();
        const userName =
          session.user?.name || session.user?.email || "Anonymous";
        const userId = session.user?.id || "anonymous";
        const color = colorForUser(userId);

        myUserIdRef.current = userId;

        // The component may have unmounted (or StrictMode re-ran the effect)
        // while we were fetching the session. Bail out before creating a client
        // so we never connect-then-close in the first place.
        if (disposed) return;

        console.log(`[ABLY] creating Realtime client (canvasId=${canvasId})`);
        const client = new Ably.Realtime({
          // Token is fetched from our authenticated backend, which verifies
          // the session cookie and scopes the token to this canvas only.
          // echoMessages is off so our own broadcasts aren't re-delivered
          // and re-processed on flaky connections. Reconnect behavior is left
          // entirely to the SDK — no manual connect(), no custom recovery.
          logLevel: 1,
          echoMessages: false,
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

        // Track connection state so we never publish into a dead socket.
        // Ably manages the reconnect cycle on its own; we only observe it.
        client.connection.on((stateChange) => {
          const state = stateChange.current;
          const previous = stateChange.previous;
          connectionStateRef.current = state;
          console.log(
            `[ABLY] connection state: ${previous} -> ${state}`,
            stateChange.reason ?? ""
          );

          switch (state) {
            case "connected": {
              if (disposed) return;
              setCollabStatus("live");
              setCollabError(null);
              // Fresh connection (initial or after an Ably-managed reconnect)
              // — refresh the member list so new peers appear. The channel
              // reattaches on its own; no need to force it.
              if (channelRef.current) {
                refreshCollaboratorsRef.current();
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
                // Ably does not auto-reconnect from "failed"; surface it and
                // let a fresh mount re-establish the connection. HTTP delta
                // sync keeps the canvas consistent in the meantime.
                setCollabStatus("offline");
              }
              break;
            default:
              break;
          }
        });

        await client.connection.whenState("connected");

        if (disposed) {
          // The component unmounted while we were connecting — close this
          // client instead of installing it as the active one.
          console.log(
            `[ABLY] client.close() (disposed during connect, canvasId=${canvasId})`
          );
          client.close();
          return;
        }

        myClientIdRef.current = client.clientId;

        const channel = client.channels.get(`canvas:${canvasId}:collab`);
        channelRef.current = channel;

        channel.on((stateChange) => {
          console.log(
            `[ABLY] channel state: ${channel.name} ${stateChange.previous} -> ${stateChange.current}`
          );
        });

        channel.subscribe("scene", handleSceneMessage);
        channel.presence.subscribe("enter", handlePresenceJoin);
        channel.presence.subscribe("present", handlePresenceJoin);
        channel.presence.subscribe("update", handlePresenceChange);
        channel.presence.subscribe("leave", handlePresenceChange);

        await channel.presence.enter({ name: userName, color, pointer: null });

        if (!disposed) {
          setIsCollaborating(true);
          refreshCollaboratorsRef.current();
          // Periodically re-broadcast the full scene as a safety net for any
          // deltas lost to rate limits or flaky connections.
          resyncIntervalRef.current = setInterval(() => {
            publishSceneRef.current(
              contentRef.current.elements,
              contentRef.current.appState,
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
          } else {
            // Transient failure — surface it; HTTP delta sync keeps the canvas
            // consistent while realtime is unavailable.
            setCollabStatus("offline");
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
      console.log(`[ABLY] effect cleanup (canvasId=${canvasId})`);
      setIsCollaborating(false);
      setCollabError(null);
      receivedSceneRef.current = false;
      pendingRemoteSceneRef.current = null;
      broadcastedVersions.clear();
      chunkAssembler.reset();
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
      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
        pointerIdleTimeoutRef.current = null;
      }
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
        broadcastTimeoutRef.current = null;
      }

      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      const channel = channelRef.current;
      const client = ablyClientRef.current;
      channelRef.current = null;
      ablyClientRef.current = null;

      if (channel) {
        console.log(
          `[ABLY] leaving presence + detaching channel: ${channel.name}`
        );
        channel.presence.leave().catch(() => undefined);
        channel.unsubscribe();
        channel.detach().catch(() => undefined);
      }
      client?.connection.off();
      if (client) {
        console.log(`[ABLY] client.close() (cleanup, canvasId=${canvasId})`);
      }
      client?.close();
    };
    // The callbacks used by this effect are deliberately accessed through refs
    // so their identity can never tear down and recreate the Ably connection.
    // They only change with canvasId, which is the sole dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  return {
    isCollaborating,
    collabStatus,
    collabError,
    currentUserInfo,
    collaboratorsList,
    broadcastLocalScene,
    refreshCollaborators,
    handlePointerUpdate,
    setIsCollaborating,
  };
}