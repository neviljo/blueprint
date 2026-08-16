import { useState, useEffect, useRef, useCallback } from "react";
import { Box, IconButton, Tooltip, CircularProgress } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import Ably from "ably";
import { Excalidraw, CaptureUpdateAction, getSceneVersion } from "@excalidraw/excalidraw";
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

const COLLAB_COLORS: CollabColor[] = [
  { background: "#f472b6", stroke: "#9d174d" },
  { background: "#60a5fa", stroke: "#1e40af" },
  { background: "#34d399", stroke: "#065f46" },
  { background: "#fbbf24", stroke: "#92400e" },
  { background: "#a78bfa", stroke: "#5b21b6" },
  { background: "#22d3ee", stroke: "#155e75" },
];

/** How long to wait after a local change before publishing it to the channel. */
const SCENE_BROADCAST_DELAY = 200;
/** Minimum interval between pointer presence updates. */
const POINTER_THROTTLE_MS = 50;

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
  const isLight = editorTheme === "light";

  const navigate = useNavigate();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const currentContentRef = useRef<CanvasContent>({
    elements: [],
    appState: { theme: "dark" },
  });
  const loadingRef = useRef(true);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const myClientIdRef = useRef<string | null>(null);
  const myPresenceRef = useRef<PresenceData | null>(null);
  const lastSceneSignatureRef = useRef<string | null>(null);
  const currentSceneVersionRef = useRef(0);
  const receivedSceneRef = useRef(false);
  const pendingRemoteSceneRef = useRef<CanvasContent | null>(null);
  const lastPointerPublishRef = useRef(0);
  const sceneChunksRef = useRef<
    Map<
      string,
      {
        nonce: string;
        total: number;
        parts: Map<number, ExcalidrawElement[]>;
        appState?: SceneMessage["appState"];
      }
    >
  >(new Map());

  // Publish the current scene to the channel. `force` bypasses the signature
  // dedup so we can share our scene with newly-joined members.
  const publishScene = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      force = false
    ) => {
      const channel = channelRef.current;
      if (!channel) return;

      const cleanAppState: SceneMessage["appState"] = {
        theme: appState.theme,
        viewBackgroundColor: appState.viewBackgroundColor,
      };
      const signature = JSON.stringify({ elements, appState: cleanAppState });
      if (!force && signature === lastSceneSignatureRef.current) return;
      lastSceneSignatureRef.current = signature;

      const fullElements = [...elements];
      const payload = JSON.stringify({
        elements: fullElements,
        appState: cleanAppState,
      });

      // Small scene: publish in a single message.
      if (byteLength(payload) <= SCENE_CHUNK_BYTES) {
        channel
          .publish("scene", {
            elements: fullElements,
            appState: cleanAppState,
          } satisfies SceneMessage)
          .catch((error) => {
            console.warn("Failed to broadcast scene:", error);
          });
        return;
      }

      // Large scene: split elements into parts that each stay under the byte
      // budget, tagged with a shared nonce so receivers can reassemble them.
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const parts: ExcalidrawElement[][] = [];
      let part: ExcalidrawElement[] = [];
      let partSize = 0;

      for (const element of fullElements) {
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

      const total = parts.length;
      const publishes = parts.map((partElements, index) => {
        const isLast = index === total - 1;
        return channel.publish(
          "scene",
          {
            elements: partElements,
            appState: isLast ? cleanAppState : undefined,
            chunk: { index, total, nonce },
          } satisfies SceneMessage
        );
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

    try {
      const members = await channel.presence.get();
      const collaborators = new Map<SocketId, Collaborator>();

      for (const member of members) {
        if (member.clientId === myClientId) continue;

        const data = member.data as PresenceData | undefined;
        if (!data?.name) continue;

        collaborators.set(member.clientId as SocketId, {
          id: member.clientId,
          username: data.name,
          color: data.color,
          pointer: data.pointer
            ? { x: data.pointer.x, y: data.pointer.y, tool: data.pointer.tool }
            : undefined,
        });
      }

      excalidrawRef.current?.updateScene({ collaborators });
    } catch (err) {
      console.warn("Failed to refresh collaborators:", err);
    }
  }, []);

  // Set up the Ably realtime connection: presence for live cursors and a
  // channel for scene synchronization between members of the workspace.
  useEffect(() => {
    let disposed = false;

    const handlePresenceJoin = (member: Ably.PresenceMessage) => {
      if (member.clientId === myClientIdRef.current) return;

      refreshCollaborators();
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

    const handlePresenceChange = () => {
      refreshCollaborators();
    };

    const applyScene = (data: SceneMessage) => {
      const incomingVersion = getSceneVersion(data.elements);
      if (incomingVersion <= currentSceneVersionRef.current) return;

      const appState: SceneMessage["appState"] = {
        theme: data.appState?.theme,
        viewBackgroundColor: data.appState?.viewBackgroundColor,
      };
      const signature = JSON.stringify({ elements: data.elements, appState });
      if (signature === lastSceneSignatureRef.current) return;
      lastSceneSignatureRef.current = signature;

      // Drop any pending local broadcast so we don't overwrite the fresher
      // remote scene with a stale one.
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
        broadcastTimeoutRef.current = null;
      }

      const scene: CanvasContent = { elements: data.elements, appState };

      if (loadingRef.current) {
        // Editor not mounted yet — use the remote scene as the initial scene.
        pendingRemoteSceneRef.current = scene;
        receivedSceneRef.current = true;
        return;
      }

      receivedSceneRef.current = true;
      currentSceneVersionRef.current = incomingVersion;

      excalidrawRef.current?.updateScene({
        elements: scene.elements,
        appState: {
          theme: appState.theme ?? "dark",
          viewBackgroundColor:
            appState.viewBackgroundColor ??
            (appState.theme === "light" ? "#ffffff" : "#121212"),
        },
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
          buffer = { nonce, total, parts: new Map(), appState: undefined };
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
        });
        return;
      }

      applyScene(data);
    };

    async function setupRealtime() {
      setCollabError(null);
      try {
        const session = await getCurrentSession();
        const userName =
          session.user?.name || session.user?.email || "Anonymous";
        const userId = session.user?.id || "anonymous";
        const color = colorForUser(userId);

        const client = new Ably.Realtime({
          // Token is fetched from our authenticated backend, which verifies
          // the session cookie and scopes the token to this canvas only.
          authCallback: (_data, callback) => {
            canvasApi
              .getAblyToken(canvasId)
              .then((tokenRequest) => callback(null, tokenRequest))
              .catch((error) => callback(error, null));
          },
        });

        ablyClientRef.current = client;
        myPresenceRef.current = { name: userName, color, pointer: null };

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
        }
      } catch (error) {
        console.warn(
          "Realtime collaboration could not be enabled (is ABLY_API_KEY set on the backend?):",
          error
        );
        if (!disposed) {
          setCollabError(
            "Live collaboration is unavailable. Check that ABLY_API_KEY is set with Publish/Subscribe/Presence capability."
          );
        }
      }
    }

    setupRealtime();

    return () => {
      disposed = true;
      setIsCollaborating(false);
      setCollabError(null);
      receivedSceneRef.current = false;
      lastSceneSignatureRef.current = null;
      pendingRemoteSceneRef.current = null;
      sceneChunksRef.current.clear();
      myClientIdRef.current = null;
      myPresenceRef.current = null;

      const channel = channelRef.current;
      const client = ablyClientRef.current;
      channelRef.current = null;
      ablyClientRef.current = null;

      if (channel) {
        channel.presence.leave().catch(() => undefined);
        channel.unsubscribe();
        channel.detach().catch(() => undefined);
      }
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
      if (broadcastTimeoutRef.current) {
        clearTimeout(broadcastTimeoutRef.current);
      }
      broadcastTimeoutRef.current = setTimeout(() => {
        publishScene(elements, appState);
      }, SCENE_BROADCAST_DELAY);
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveCanvasContent([...elements], appState);
    }, 1500);
  };

  // Stream pointer position to other members via presence updates (throttled)
  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const now = Date.now();
      if (now - lastPointerPublishRef.current < POINTER_THROTTLE_MS) return;
      lastPointerPublishRef.current = now;

      const channel = channelRef.current;
      const presence = myPresenceRef.current;
      if (!channel || !presence) return;

      const updated: PresenceData = {
        ...presence,
        pointer: {
          x: payload.pointer.x,
          y: payload.pointer.y,
          tool: payload.pointer.tool,
        },
      };
      myPresenceRef.current = updated;
      channel.presence.update(updated).catch(() => undefined);
    },
    []
  );

  // Capture the Excalidraw imperative API (refs are unsupported since v0.17)
  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = api;
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
