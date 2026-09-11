import { useState, useEffect, useRef, useCallback } from "react";
import { Box, IconButton, Tooltip, CircularProgress, Avatar, AvatarGroup, Typography, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import Ably from "ably";
import {
  Excalidraw,
  CaptureUpdateAction,
  UserIdleState,
  reconcileElements,
  Sidebar,
  TTDDialog,
  TTDDialogTrigger,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useNavigate } from "@tanstack/react-router";
import { canvasApi } from "../lib/api";
import type { CanvasContent } from "../lib/types";
import { getCurrentSession } from "../lib/auth";
import { generateDiagram } from "../lib/ai";
import AiPanel from "./AiPanel";

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

interface ChunkMeta {
  index: number;
  total: number;
  nonce: string;
}

type ScenePayload = {
  type: "SCENE_UPDATE" | "SCENE_RESPONSE";
  forClientId?: string;
  elements: ExcalidrawElement[];
  appState?: Partial<AppState>;
  chunk?: ChunkMeta;
};

type SocketPayload =
  | ScenePayload
  | {
      type: "REQUEST_SCENE";
    }
  | {
      type: "CURSOR_UPDATE";
      pointer: CollabPointer | null;
    };

const COLLAB_COLORS: CollabColor[] = [
  { background: "#f472b6", stroke: "#9d174d" },
  { background: "#60a5fa", stroke: "#1e40af" },
  { background: "#34d399", stroke: "#065f46" },
  { background: "#fbbf24", stroke: "#92400e" },
  { background: "#a78bfa", stroke: "#5b21b6" },
  { background: "#22d3ee", stroke: "#155e75" },
];

const POINTER_THROTTLE_MS = 100; // ~10fps; lossy is fine, trailing flush keeps last pose
const SCENE_BROADCAST_THROTTLE_MS = 50; // Max 20 msgs/sec for live strokes
const POINTER_IDLE_CLEAR_MS = 1500;
const MAX_CHUNK_BYTES = 28000; // Stay conservatively under Ably's 64KB limit

function colorForUser(id: string): CollabColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

/** Splits elements array into sub-chunks staying under per-message byte budget */
function splitElements(elements: readonly ExcalidrawElement[]): ExcalidrawElement[][] {
  const parts: ExcalidrawElement[][] = [];
  let currentPart: ExcalidrawElement[] = [];
  let currentBytes = 0;

  for (const element of elements) {
    const elementBytes = new TextEncoder().encode(JSON.stringify(element)).length;
    if (currentPart.length > 0 && currentBytes + elementBytes > MAX_CHUNK_BYTES) {
      parts.push(currentPart);
      currentPart = [element];
      currentBytes = elementBytes;
    } else {
      currentPart.push(element);
      currentBytes += elementBytes;
    }
  }
  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts;
}

export default function CanvasWorkspace({ canvasId }: CanvasWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<CanvasContent | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState<"dark" | "light">("dark");
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collabStatus, setCollabStatus] = useState<
    "connecting" | "live" | "reconnecting" | "offline"
  >("connecting");
  const isLight = editorTheme === "light";

  const navigate = useNavigate();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneBroadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSceneBroadcastRef = useRef(0);
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const currentContentRef = useRef<CanvasContent>({
    elements: [],
    appState: { theme: "dark" },
  });

  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const sceneChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const cursorChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const myClientIdRef = useRef<string | null>(null);
  const previousElementsMap = useRef<Map<string, { version: number; versionNonce: number }>>(new Map());
  const pendingBroadcastElementsRef = useRef<Map<string, ExcalidrawElement>>(new Map());
  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());
  const sceneChunksRef = useRef<
    Map<
      string,
      {
        nonce: string;
        total: number;
        parts: Map<number, ExcalidrawElement[]>;
        appState?: Partial<AppState>;
        type: "SCENE_UPDATE" | "SCENE_RESPONSE";
      }
    >
  >(new Map());

  const lastPointerPublishRef = useRef(0);
  const pendingPointerRef = useRef<CollabPointer | null | undefined>(undefined);
  const pointerFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [collaboratorsList, setCollaboratorsList] = useState<Collaborator[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ name: string; color: CollabColor }>({
    name: "You",
    color: COLLAB_COLORS[0],
  });

  // Publishes objects (Ably msgpack) — never pre-stringify. Cursors go on a
  // separate channel so they cannot stall scene deltas at the 50 msg/s cap.
  const sendPayload = useCallback((data: SocketPayload) => {
    if (data.type === "CURSOR_UPDATE") {
      const channel = cursorChannelRef.current;
      if (!channel || channel.state !== "attached") return;
      channel.publish("cursor", data).catch((error) => {
        console.warn("[COLLAB] Failed to publish cursor:", error);
      });
      return;
    }

    const channel = sceneChannelRef.current;
    if (!channel || channel.state !== "attached") {
      console.debug("[COLLAB] sendPayload skipped — channel not attached, state:", channel?.state);
      return;
    }

    if (data.type === "SCENE_UPDATE" || data.type === "SCENE_RESPONSE") {
      const rawElements = data.elements;
      const estimated = JSON.stringify(data).length;

      if (estimated <= MAX_CHUNK_BYTES) {
        channel.publish("collab", data).catch((error) => {
          console.warn("[COLLAB] Failed to publish payload:", error);
        });
        return;
      }

      const parts = splitElements(rawElements);
      const total = parts.length;
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      parts.forEach((partElements, index) => {
        const chunkPayload: SocketPayload = {
          ...data,
          elements: partElements,
          appState: index === total - 1 ? data.appState : undefined,
          chunk: { index, total, nonce },
        };
        channel.publish("collab", chunkPayload).catch((error) => {
          console.warn("[COLLAB] Failed to publish chunk:", error);
        });
      });
      return;
    }

    channel.publish("collab", data).catch((error) => {
      console.warn("[COLLAB] Failed to publish payload:", error);
    });
  }, []);

  // Save content to backend database API as a debounced backup
  const saveCanvasContent = useCallback(
    async (elements: ExcalidrawElement[], appState: Partial<AppState>) => {
      const cleanAppState: Partial<AppState> = { ...appState };
      delete cleanAppState.collaborators;

      try {
        await canvasApi.updateContent(
          canvasId,
          JSON.stringify({
            elements,
            appState: cleanAppState,
          })
        );
      } catch (err) {
        console.warn("[EXCALIDRAW] Failed to save canvas content to DB backup:", err);
      }
    },
    [canvasId]
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

        if (parsedContent) {
          const loadedAppState = { ...(parsedContent.appState || {}) };
          const savedTheme = loadedAppState.theme === "light" ? "light" : "dark";
          const scene: CanvasContent = {
            elements: parsedContent.elements || [],
            appState: { ...loadedAppState, viewModeEnabled: false },
          };
          setEditorTheme(savedTheme);
          setInitialData(scene);
          currentContentRef.current = scene;

          (parsedContent.elements || []).forEach((el: ExcalidrawElement) => {
            previousElementsMap.current.set(el.id, {
              version: el.version,
              versionNonce: el.versionNonce,
            });
          });
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
        console.warn("[EXCALIDRAW] Could not fetch canvas data from DB, initializing empty:", err);
        setEditorTheme("dark");
        const scene: CanvasContent = {
          elements: [],
          appState: { theme: "dark", viewModeEnabled: false },
        };
        setInitialData(scene);
        currentContentRef.current = scene;
      } finally {
        setLoading(false);
      }
    }

    if (canvasId) {
      loadCanvas();
    }
  }, [canvasId]);

  // Main Realtime Socket Setup: Standard Excalidraw Room Protocol
  useEffect(() => {
    let disposed = false;

    async function setupRealtime() {
      try {
        // 1. Auth Session & User Profile
        const session = await getCurrentSession();
        const userName = session.user?.name || session.user?.email || "Anonymous";
        const userId = session.user?.id || "anonymous";
        const color = colorForUser(userId);

        setCurrentUserInfo({ name: userName, color });

        if (disposed) return;

        // 2. Initialize Ably WebSocket client with server-side token auth
        const client = new Ably.Realtime({
          logLevel: 1,
          echoMessages: false,
          authCallback: (_data, callback) => {
            canvasApi
              .getAblyToken(canvasId)
              .then((tokenRequest) => callback(null, tokenRequest))
              .catch((error) => callback(error, null));
          },
        });

        ablyClientRef.current = client;

        client.connection.on((stateChange) => {
          const state = stateChange.current;
          if (disposed) return;

          switch (state) {
            case "connected":
              setCollabStatus("live");
              setIsCollaborating(true);
              break;
            case "disconnected":
            case "suspended":
              setCollabStatus("reconnecting");
              break;
            case "failed":
              setCollabStatus("offline");
              console.warn("[COLLAB] Connection failed:", stateChange.reason);
              break;
          }
        });

        await client.connection.whenState("connected");
        if (disposed) {
          client.close();
          return;
        }

        myClientIdRef.current = client.clientId;
        console.info("[COLLAB] Connected. clientId:", client.clientId);

        // 3. Separate scene vs cursor channels so pointer spam cannot stall strokes
        const sceneChannel = client.channels.get(`canvas:${canvasId}:scene`);
        const cursorChannel = client.channels.get(`canvas:${canvasId}:cursors`);
        sceneChannelRef.current = sceneChannel;
        cursorChannelRef.current = cursorChannel;

        const parsePayload = (data: unknown): SocketPayload | null => {
          if (typeof data === "string") {
            try {
              return JSON.parse(data) as SocketPayload;
            } catch {
              console.warn("[COLLAB] Failed to parse message:", data);
              return null;
            }
          }
          if (data && typeof data === "object") {
            return data as SocketPayload;
          }
          return null;
        };

        const applyRemoteScene = (payload: ScenePayload) => {
          if (payload.type === "SCENE_UPDATE") {
            const localElements = excalidrawRef.current?.getSceneElements() || currentContentRef.current.elements;
            const currentAppState = excalidrawRef.current?.getAppState() || currentContentRef.current.appState;

            const reconciled = reconcileElements(
              localElements as any,
              payload.elements as any,
              currentAppState as any
            ) as ExcalidrawElement[];

            currentContentRef.current.elements = reconciled;
            reconciled.forEach((el) => {
              previousElementsMap.current.set(el.id, {
                version: el.version,
                versionNonce: el.versionNonce,
              });
            });

            excalidrawRef.current?.updateScene({
              elements: reconciled,
              appState: payload.appState?.theme ? { theme: payload.appState.theme } : undefined,
              collaborators: new Map(collaboratorsRef.current),
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          } else {
            currentContentRef.current.elements = payload.elements;
            payload.elements.forEach((el) => {
              previousElementsMap.current.set(el.id, {
                version: el.version,
                versionNonce: el.versionNonce,
              });
            });

            excalidrawRef.current?.updateScene({
              elements: payload.elements,
              appState: payload.appState?.theme ? { theme: payload.appState.theme } : undefined,
              collaborators: new Map(collaboratorsRef.current),
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }

          if (payload.appState?.theme === "light" || payload.appState?.theme === "dark") {
            setEditorTheme(payload.appState.theme);
          }
        };

        sceneChannel.subscribe("collab", (message: Ably.Message) => {
          if (disposed) return;

          const payload = parsePayload(message.data);
          if (!payload || !payload.type) return;

          if (payload.type === "SCENE_UPDATE" || payload.type === "SCENE_RESPONSE") {
            let next: ScenePayload = payload;
            if (payload.chunk) {
              const sender = message.clientId || "unknown";
              const { index, total, nonce } = payload.chunk;
              let buffer = sceneChunksRef.current.get(sender);

              if (!buffer || buffer.nonce !== nonce) {
                buffer = {
                  nonce,
                  total,
                  parts: new Map(),
                  appState: payload.appState,
                  type: payload.type,
                };
                sceneChunksRef.current.set(sender, buffer);
              }

              buffer.parts.set(index, payload.elements);
              if (payload.appState) buffer.appState = payload.appState;

              if (buffer.parts.size < total) return;

              sceneChunksRef.current.delete(sender);

              const assembled: ExcalidrawElement[] = [];
              for (let i = 0; i < total; i++) {
                const part = buffer.parts.get(i);
                if (!part) return;
                assembled.push(...part);
              }
              next = {
                ...payload,
                elements: assembled,
                appState: buffer.appState ?? payload.appState,
              };
            }

            if (next.type === "SCENE_RESPONSE" && next.forClientId !== myClientIdRef.current) {
              return;
            }

            applyRemoteScene(next);
            return;
          }

          if (payload.type === "REQUEST_SCENE") {
            const requesterId = message.clientId;
            if (!requesterId || requesterId === myClientIdRef.current) return;
            const currentElements = excalidrawRef.current?.getSceneElements() || currentContentRef.current.elements;
            if (currentElements.length > 0) {
              sendPayload({
                type: "SCENE_RESPONSE",
                forClientId: requesterId,
                elements: [...currentElements],
                appState: excalidrawRef.current?.getAppState() || currentContentRef.current.appState,
              });
            }
          }
        });

        cursorChannel.subscribe("cursor", (message: Ably.Message) => {
          if (disposed) return;

          const payload = parsePayload(message.data);
          if (!payload || payload.type !== "CURSOR_UPDATE") return;

          const socketId = (message.clientId || "") as SocketId;
          if (!socketId || socketId === myClientIdRef.current) return;

          const existing = collaboratorsRef.current.get(socketId);
          if (!payload.pointer) {
            if (existing) {
              collaboratorsRef.current.set(socketId, {
                ...existing,
                pointer: undefined,
              });
            }
          } else {
            collaboratorsRef.current.set(socketId, {
              id: socketId,
              socketId,
              username: existing?.username || "Collaborator",
              color: existing?.color || COLLAB_COLORS[0],
              pointer: {
                x: payload.pointer.x,
                y: payload.pointer.y,
                tool: payload.pointer.tool || "pointer",
                renderCursor: true,
              },
              userState: UserIdleState.ACTIVE,
              button: "up",
            });
          }

          // Pointer-only: do not setCollaboratorsList (avoids re-rendering the whole board)
          excalidrawRef.current?.updateScene({
            collaborators: new Map(collaboratorsRef.current),
          });
        });

        // 5. Ably Presence for Room Member Avatars (low-frequency enter/leave)
        sceneChannel.presence.subscribe((member) => {
          if (member.clientId === myClientIdRef.current) return;
          const socketId = member.clientId as SocketId;

          if (member.action === "leave" || member.action === "absent") {
            collaboratorsRef.current.delete(socketId);
          } else if (member.action === "enter" || member.action === "present" || member.action === "update") {
            const data = member.data as { username: string; color: CollabColor } | undefined;
            if (data?.username) {
              const existing = collaboratorsRef.current.get(socketId);
              collaboratorsRef.current.set(socketId, {
                id: member.clientId,
                socketId,
                username: data.username,
                color: data.color || COLLAB_COLORS[0],
                pointer: existing?.pointer,
                userState: UserIdleState.ACTIVE,
                button: "up",
              });
            }
          }
          const nextList = Array.from(collaboratorsRef.current.values());
          setCollaboratorsList(nextList);
          excalidrawRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) });
        });

        await Promise.all([sceneChannel.attach(), cursorChannel.attach()]);

        // Join presence once on room attach to share our name & color avatar
        await sceneChannel.presence.enter({ username: userName, color });

        // Query initial present room members to populate avatar stack instantly
        const existingMembers = await sceneChannel.presence.get();
        existingMembers.forEach((m) => {
          if (m.clientId === myClientIdRef.current) return;
          const data = m.data as { username: string; color: CollabColor } | undefined;
          if (data?.username) {
            const socketId = m.clientId as SocketId;
            collaboratorsRef.current.set(socketId, {
              id: m.clientId,
              socketId,
              username: data.username,
              color: data.color || COLLAB_COLORS[0],
              pointer: undefined,
              userState: UserIdleState.ACTIVE,
              button: "up",
            });
          }
        });
        setCollaboratorsList(Array.from(collaboratorsRef.current.values()));
        excalidrawRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) });

        sendPayload({
          type: "REQUEST_SCENE",
        });

      } catch (err) {
        console.warn("[EXCALIDRAW] Failed to establish real-time collaboration:", err);
        if (!disposed) {
          setCollabStatus("offline");
        }
      }
    }

    setupRealtime();

    return () => {
      disposed = true;
      setIsCollaborating(false);
      collaboratorsRef.current.clear();
      setCollaboratorsList([]);
      sceneChunksRef.current.clear();
      pendingBroadcastElementsRef.current.clear();

      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
        pointerIdleTimeoutRef.current = null;
      }
      if (pointerFlushTimeoutRef.current) {
        clearTimeout(pointerFlushTimeoutRef.current);
        pointerFlushTimeoutRef.current = null;
      }
      if (sceneBroadcastTimeoutRef.current) {
        clearTimeout(sceneBroadcastTimeoutRef.current);
        sceneBroadcastTimeoutRef.current = null;
      }

      const sceneChannel = sceneChannelRef.current;
      const cursorChannel = cursorChannelRef.current;
      const client = ablyClientRef.current;
      sceneChannelRef.current = null;
      cursorChannelRef.current = null;
      ablyClientRef.current = null;

      if (sceneChannel) {
        sceneChannel.presence.leave().catch(() => undefined);
        sceneChannel.unsubscribe();
        sceneChannel.detach().catch(() => undefined);
      }
      if (cursorChannel) {
        cursorChannel.unsubscribe();
        cursorChannel.detach().catch(() => undefined);
      }
      client?.connection.off();
      client?.close();
    };
  }, [canvasId, sendPayload]);

  const broadcastSceneUpdate = useCallback(
    (changedElements: ExcalidrawElement[], appState: AppState) => {
      sendPayload({
        type: "SCENE_UPDATE",
        elements: changedElements,
        appState: {
          theme: appState.theme,
          viewBackgroundColor: appState.viewBackgroundColor,
        },
      });
    },
    [sendPayload]
  );

  // Excalidraw Drawing Changes (throttled delta diff check -> publish changed elements -> debounced DB save)
  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState
  ) => {
    setEditorTheme(appState.theme === "light" ? "light" : "dark");

    // Version diff already ignores remote-applied elements (map is updated
    // before updateScene). Do not mute onChange with a timer — that dropped
    // local strokes while the other person was drawing.
    const changedElements: ExcalidrawElement[] = [];
    elements.forEach((el) => {
      const prev = previousElementsMap.current.get(el.id);
      if (
        !prev ||
        prev.version !== el.version ||
        prev.versionNonce !== el.versionNonce
      ) {
        changedElements.push(el);
      }
      previousElementsMap.current.set(el.id, {
        version: el.version,
        versionNonce: el.versionNonce,
      });
    });

    if (changedElements.length === 0) {
      currentContentRef.current.appState = appState;
      return;
    }

    currentContentRef.current = {
      elements: [...elements],
      appState,
    };

    changedElements.forEach((el) => {
      pendingBroadcastElementsRef.current.set(el.id, el);
    });

    const now = Date.now();
    if (now - lastSceneBroadcastRef.current >= SCENE_BROADCAST_THROTTLE_MS) {
      lastSceneBroadcastRef.current = now;
      if (sceneBroadcastTimeoutRef.current) {
        clearTimeout(sceneBroadcastTimeoutRef.current);
        sceneBroadcastTimeoutRef.current = null;
      }
      const toSend = Array.from(pendingBroadcastElementsRef.current.values());
      pendingBroadcastElementsRef.current.clear();
      broadcastSceneUpdate(toSend, appState);
    } else {
      if (sceneBroadcastTimeoutRef.current) {
        clearTimeout(sceneBroadcastTimeoutRef.current);
      }
      sceneBroadcastTimeoutRef.current = setTimeout(() => {
        sceneBroadcastTimeoutRef.current = null;
        lastSceneBroadcastRef.current = Date.now();
        const toSend = Array.from(pendingBroadcastElementsRef.current.values());
        pendingBroadcastElementsRef.current.clear();
        if (toSend.length > 0) {
          broadcastSceneUpdate(toSend, appState);
        }
      }, SCENE_BROADCAST_THROTTLE_MS);
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCanvasContent([...elements], appState);
    }, 1500);
  };

  const flushPointer = useCallback(() => {
    pointerFlushTimeoutRef.current = null;
    if (pendingPointerRef.current === undefined) return;
    lastPointerPublishRef.current = Date.now();
    const pointer = pendingPointerRef.current;
    pendingPointerRef.current = undefined;
    sendPayload({
      type: "CURSOR_UPDATE",
      pointer,
    });
  }, [sendPayload]);

  // Live mouse pointers: tiny payload, trailing throttle, droppable-by-rate.
  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      pendingPointerRef.current = {
        x: payload.pointer.x,
        y: payload.pointer.y,
        tool: payload.pointer.tool,
      };

      const wait = POINTER_THROTTLE_MS - (Date.now() - lastPointerPublishRef.current);
      if (wait <= 0) {
        if (pointerFlushTimeoutRef.current) {
          clearTimeout(pointerFlushTimeoutRef.current);
        }
        flushPointer();
      } else if (!pointerFlushTimeoutRef.current) {
        pointerFlushTimeoutRef.current = setTimeout(flushPointer, wait);
      }

      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
      }
      pointerIdleTimeoutRef.current = setTimeout(() => {
        pointerIdleTimeoutRef.current = null;
        pendingPointerRef.current = undefined;
        if (pointerFlushTimeoutRef.current) {
          clearTimeout(pointerFlushTimeoutRef.current);
          pointerFlushTimeoutRef.current = null;
        }
        lastPointerPublishRef.current = Date.now();
        sendPayload({
          type: "CURSOR_UPDATE",
          pointer: null,
        });
      }, POINTER_IDLE_CLEAR_MS);
    },
    [flushPointer, sendPayload]
  );

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawRef.current = api;
  }, []);

  const handleToggleBackground = useCallback(() => {
    const next: "dark" | "light" = editorTheme === "dark" ? "light" : "dark";
    setEditorTheme(next);
    const appState = currentContentRef.current.appState || {};
    const updatedAppState = { ...appState, theme: next, viewBackgroundColor: "#ffffff" };
    currentContentRef.current.appState = updatedAppState;
    excalidrawRef.current?.updateScene({
      appState: { theme: next, viewBackgroundColor: "#ffffff" },
    });
    sendPayload({
      type: "SCENE_UPDATE",
      elements: [],
      appState: { theme: next, viewBackgroundColor: "#ffffff" },
    });
    saveCanvasContent(currentContentRef.current.elements, updatedAppState);
  }, [editorTheme, sendPayload, saveCanvasContent]);

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

      <Tooltip title="AI">
        <IconButton
          onClick={() => {
            const api = excalidrawRef.current;
            if (!api) return;
            const open = api.getAppState().openSidebar;
            api.updateScene({
              appState: {
                openSidebar: open?.name === "ai" ? null : { name: "ai", tab: "chat" },
              },
            });
          }}
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 11,
            color: "#A6A6A6",
            bgcolor: "rgba(18, 18, 18, 0.8)",
            border: "1px solid #1f1f1f",
            "&:hover": { color: "#ECECEC", bgcolor: "#27272A" },
          }}
          size="small"
        >
          <AutoAwesomeIcon fontSize="small" />
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

      {/* Realtime Collaboration Indicator & Participants Stack */}
      <Box
        sx={{
          position: "absolute",
          top: 14,
          right: 64,
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
                : "Offline"}
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.15)", my: 0.25 }} />

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
          >
            <TTDDialogTrigger>Text to diagram</TTDDialogTrigger>
            <TTDDialog
              onTextSubmit={async (value) => {
                try {
                  try {
                    const mermaid = await generateDiagram(value);
                    return { generatedResponse: mermaid };
                  } catch {
                    const mermaid = await generateDiagram(value, true);
                    return { generatedResponse: mermaid };
                  }
                } catch (error) {
                  return {
                    generatedResponse: undefined,
                    error: error instanceof Error ? error : new Error("Generate failed"),
                  };
                }
              }}
            />
            <Sidebar name="ai" className="blueprint-ai-sidebar">
              <Sidebar.Header>AI</Sidebar.Header>
              <Sidebar.Tabs>
                <Sidebar.TabTriggers>
                  <Sidebar.TabTrigger tab="chat">Chat</Sidebar.TabTrigger>
                  <Sidebar.TabTrigger tab="summarize">Summarize</Sidebar.TabTrigger>
                </Sidebar.TabTriggers>
                <Sidebar.Tab tab="chat">
                  <AiPanel tab="chat" getApi={() => excalidrawRef.current} />
                </Sidebar.Tab>
                <Sidebar.Tab tab="summarize">
                  <AiPanel tab="summarize" getApi={() => excalidrawRef.current} />
                </Sidebar.Tab>
              </Sidebar.Tabs>
            </Sidebar>
          </Excalidraw>
        )}
      </Box>
    </Box>
  );
}
