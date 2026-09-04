import { useState, useEffect, useRef, useCallback } from "react";
import { Box, IconButton, Tooltip, CircularProgress, Avatar, AvatarGroup, Typography, Divider } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import Ably from "ably";
import { Excalidraw, CaptureUpdateAction, UserIdleState, reconcileElements } from "@excalidraw/excalidraw";
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
import { generateKey, importKey, encryptData, decryptData } from "../lib/crypto";

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

type SocketPayload =
  | {
      type: "SCENE_UPDATE";
      elements: ExcalidrawElement[];
      appState?: Partial<AppState>;
    }
  | {
      type: "REQUEST_SCENE";
      clientId: string;
    }
  | {
      type: "SCENE_RESPONSE";
      elements: ExcalidrawElement[];
      appState?: Partial<AppState>;
    }
  | {
      type: "CURSOR_UPDATE";
      clientId: string;
      username: string;
      color: CollabColor;
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

const POINTER_THROTTLE_MS = 50; // ~20fps smooth cursor stream
const POINTER_IDLE_CLEAR_MS = 1500;

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
  const [collabStatus, setCollabStatus] = useState<
    "connecting" | "live" | "reconnecting" | "offline"
  >("connecting");
  const isLight = editorTheme === "light";

  const navigate = useNavigate();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const currentContentRef = useRef<CanvasContent>({
    elements: [],
    appState: { theme: "dark" },
  });

  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const myClientIdRef = useRef<string | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const previousElementsMap = useRef<Map<string, { version: number; versionNonce: number }>>(new Map());
  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());

  const lastPointerPublishRef = useRef(0);
  const pointerIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [collaboratorsList, setCollaboratorsList] = useState<Collaborator[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<{ name: string; color: CollabColor }>({
    name: "You",
    color: COLLAB_COLORS[0],
  });

  // Encrypts and publishes socket payload to room peers
  const sendPayload = useCallback((data: SocketPayload) => {
    const channel = channelRef.current;
    if (channel && channel.state === "attached") {
      encryptData(cryptoKeyRef.current, data).then((encrypted) => {
        channel.publish("collab", encrypted).catch((error) => {
          console.warn("[EXCALIDRAW] Failed to broadcast socket payload:", error);
        });
      });
    }
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
        // 1. E2EE URL Hash & LocalStorage Key Consistency (#room=<canvasId>,<key>)
        let keyStr: string | undefined;
        const hashMatch = window.location.hash.slice(1).match(/room=([^,]+),(.+)/);
        if (hashMatch && hashMatch[1] === canvasId) {
          keyStr = hashMatch[2];
          localStorage.setItem(`canvas_key_${canvasId}`, keyStr);
        } else {
          const stored = localStorage.getItem(`canvas_key_${canvasId}`);
          if (stored) {
            keyStr = stored;
          } else {
            keyStr = await generateKey();
            localStorage.setItem(`canvas_key_${canvasId}`, keyStr);
          }
          window.location.hash = `room=${canvasId},${keyStr}`;
        }
        cryptoKeyRef.current = await importKey(keyStr);

        // 2. Auth Session & User Profile
        const session = await getCurrentSession();
        const userName = session.user?.name || session.user?.email || "Anonymous";
        const userId = session.user?.id || "anonymous";
        const color = colorForUser(userId);

        setCurrentUserInfo({ name: userName, color });

        if (disposed) return;

        // 3. Initialize Ably WebSocket client (stateless zero-knowledge relay)
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
              break;
          }
        });

        await client.connection.whenState("connected");
        if (disposed) {
          client.close();
          return;
        }

        myClientIdRef.current = client.clientId;

        // 4. Attach to room channel
        const channel = client.channels.get(`canvas:${canvasId}:collab`);
        channelRef.current = channel;

        // Message handler following Excalidraw wire protocol
        channel.subscribe("collab", async (message: Ably.Message) => {
          if (disposed || typeof message.data !== "string") return;

          const payload = await decryptData<SocketPayload>(
            cryptoKeyRef.current,
            message.data
          );
          if (!payload || !payload.type) return;

          if (payload.type === "SCENE_UPDATE" && payload.elements) {
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

            isRemoteUpdateRef.current = true;
            excalidrawRef.current?.updateScene({
              elements: reconciled,
              appState: payload.appState?.theme ? { theme: payload.appState.theme } : undefined,
              collaborators: new Map(collaboratorsRef.current),
              captureUpdate: CaptureUpdateAction.NEVER,
            });

            if (payload.appState?.theme === "light" || payload.appState?.theme === "dark") {
              setEditorTheme(payload.appState.theme);
            }

          } else if (payload.type === "REQUEST_SCENE") {
            // Existing peer responds to joiner's scene request
            const currentElements = excalidrawRef.current?.getSceneElements() || currentContentRef.current.elements;
            if (currentElements.length > 0) {
              sendPayload({
                type: "SCENE_RESPONSE",
                elements: [...currentElements],
                appState: excalidrawRef.current?.getAppState() || currentContentRef.current.appState,
              });
            }

          } else if (payload.type === "SCENE_RESPONSE" && payload.elements) {
            // Joiner receives scene snapshot from existing peer
            currentContentRef.current.elements = payload.elements;
            payload.elements.forEach((el) => {
              previousElementsMap.current.set(el.id, {
                version: el.version,
                versionNonce: el.versionNonce,
              });
            });

            isRemoteUpdateRef.current = true;
            excalidrawRef.current?.updateScene({
              elements: payload.elements,
              appState: payload.appState?.theme ? { theme: payload.appState.theme } : undefined,
              collaborators: new Map(collaboratorsRef.current),
              captureUpdate: CaptureUpdateAction.NEVER,
            });

            if (payload.appState?.theme === "light" || payload.appState?.theme === "dark") {
              setEditorTheme(payload.appState.theme);
            }

          } else if (payload.type === "CURSOR_UPDATE") {
            if (payload.clientId === myClientIdRef.current) return;
            const socketId = payload.clientId as SocketId;

            if (!payload.pointer) {
              collaboratorsRef.current.delete(socketId);
            } else {
              collaboratorsRef.current.set(socketId, {
                id: payload.clientId,
                socketId,
                username: payload.username,
                color: payload.color,
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

            const nextMap = new Map(collaboratorsRef.current);
            excalidrawRef.current?.updateScene({ collaborators: nextMap });
            setCollaboratorsList(Array.from(collaboratorsRef.current.values()));
          }
        });

        await channel.attach();

        // Send initial REQUEST_SCENE to active peers in the room
        sendPayload({
          type: "REQUEST_SCENE",
          clientId: client.clientId,
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

      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
        pointerIdleTimeoutRef.current = null;
      }

      const channel = channelRef.current;
      const client = ablyClientRef.current;
      channelRef.current = null;
      ablyClientRef.current = null;

      if (channel) {
        channel.unsubscribe();
        channel.detach().catch(() => undefined);
      }
      client?.connection.off();
      client?.close();
    };
  }, [canvasId, sendPayload]);

  // Excalidraw Drawing Changes (diff check -> publish SCENE_UPDATE -> debounced DB save)
  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState
  ) => {
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    currentContentRef.current = {
      elements: [...elements],
      appState,
    };

    setEditorTheme(appState.theme === "light" ? "light" : "dark");

    // Track element version/versionNonce diffs to prevent echoing unchanged elements
    let hasChanges = false;
    elements.forEach((el) => {
      const prev = previousElementsMap.current.get(el.id);
      if (
        !prev ||
        prev.version !== el.version ||
        prev.versionNonce !== el.versionNonce
      ) {
        hasChanges = true;
      }
      previousElementsMap.current.set(el.id, {
        version: el.version,
        versionNonce: el.versionNonce,
      });
    });

    if (hasChanges) {
      sendPayload({
        type: "SCENE_UPDATE",
        elements: [...elements],
        appState: {
          theme: appState.theme,
          viewBackgroundColor: appState.viewBackgroundColor,
        },
      });
    }

    // Debounced database backup save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCanvasContent([...elements], appState);
    }, 1500);
  };

  // Live Mouse Pointer Streaming (CURSOR_UPDATE)
  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const now = Date.now();
      if (now - lastPointerPublishRef.current < POINTER_THROTTLE_MS) return;
      lastPointerPublishRef.current = now;

      sendPayload({
        type: "CURSOR_UPDATE",
        clientId: myClientIdRef.current || "",
        username: currentUserInfo.name,
        color: currentUserInfo.color,
        pointer: {
          x: payload.pointer.x,
          y: payload.pointer.y,
          tool: payload.pointer.tool,
        },
      });

      if (pointerIdleTimeoutRef.current) {
        clearTimeout(pointerIdleTimeoutRef.current);
      }
      pointerIdleTimeoutRef.current = setTimeout(() => {
        pointerIdleTimeoutRef.current = null;
        sendPayload({
          type: "CURSOR_UPDATE",
          clientId: myClientIdRef.current || "",
          username: currentUserInfo.name,
          color: currentUserInfo.color,
          pointer: null,
        });
      }, POINTER_IDLE_CLEAR_MS);
    },
    [sendPayload, currentUserInfo]
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
      elements: currentContentRef.current.elements,
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
          />
        )}
      </Box>
    </Box>
  );
}
