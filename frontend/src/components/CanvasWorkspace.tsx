import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  CircularProgress,
  Avatar,
  AvatarGroup,
  Typography,
  Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useNavigate } from "@tanstack/react-router";
import { useCanvasData } from "../hooks/useCanvasData";
import { useCanvasCollaboration } from "../hooks/useCanvasCollaboration";

interface CanvasWorkspaceProps {
  canvasId: string;
}

/** How long to wait after the last drawing change before an auto-save. */
const SAVE_DEBOUNCE_MS = 1500;

export default function CanvasWorkspace({ canvasId }: CanvasWorkspaceProps) {
  const navigate = useNavigate();
  const [editorTheme, setEditorTheme] = useState<"dark" | "light">("dark");
  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable theme setter shared by the data + collaboration layers.
  const setTheme = useCallback((theme: "light" | "dark") => {
    setEditorTheme(theme);
  }, []);

  const data = useCanvasData(canvasId, setTheme);
  const collab = useCanvasCollaboration(canvasId, {
    contentRef: data.currentContentRef,
    sceneVersionRef: data.currentSceneVersionRef,
    lastDeltaSeqRef: data.lastDeltaSeqRef,
    pendingRemoteSceneRef: data.pendingRemoteSceneRef,
    receivedSceneRef: data.receivedSceneRef,
    loadingRef: data.loadingRef,
    excalidrawRef,
    setTheme,
    saveCanvasContent: data.saveCanvasContent,
    flushPendingSave: data.flushPendingSave,
  });

  const {
    loading,
    initialData,
    workspaceId,
    currentContentRef,
    receivedSceneRef,
    setLocalContent,
    saveCanvasContent,
  } = data;

  const {
    isCollaborating,
    collabStatus,
    collabError,
    currentUserInfo,
    collaboratorsList,
    broadcastLocalScene,
    refreshCollaborators,
    handlePointerUpdate,
    setIsCollaborating,
  } = collab;

  const isLight = editorTheme === "light";

  // Handle canvas drawing changes: debounced realtime broadcast + auto-save.
  // All dependencies are stable per canvasId, so this callback never changes
  // identity between renders.
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      setLocalContent(elements, appState);
      setEditorTheme(appState.theme === "light" ? "light" : "dark");

      // Only broadcast after we have received a remote scene — otherwise we
      // might overwrite fresher content from members who are already here with
      // stale data loaded from the DB.
      if (receivedSceneRef.current) {
        broadcastLocalScene(elements, appState);
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveCanvasContent([...elements], appState);
      }, SAVE_DEBOUNCE_MS);
    },
    [setLocalContent, receivedSceneRef, broadcastLocalScene, saveCanvasContent]
  );

  // Capture the Excalidraw imperative API (refs are unsupported since v0.17).
  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = api;
      // Collaboration UI (avatars/cursors) is enabled via HTTP presence —
      // independent of whether the realtime channel ever connects.
      setIsCollaborating(true);
      refreshCollaborators();
    },
    [setIsCollaborating, refreshCollaborators]
  );

  // Toggle the whole editor between light and dark theme.
  const handleToggleBackground = useCallback(() => {
    const next: "dark" | "light" = editorTheme === "dark" ? "light" : "dark";
    setEditorTheme(next);
    const appState = currentContentRef.current.appState || {};
    const updatedAppState = {
      ...appState,
      theme: next,
      viewBackgroundColor: "#ffffff",
    };
    currentContentRef.current.appState = updatedAppState;
    excalidrawRef.current?.updateScene({
      appState: { theme: next, viewBackgroundColor: "#ffffff" },
    });
    saveCanvasContent(currentContentRef.current.elements, updatedAppState);
  }, [editorTheme, currentContentRef, excalidrawRef, saveCanvasContent]);

  // Drop a pending auto-save when the canvas changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [canvasId]);

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
                  collabStatus === "live" ? "0 0 8px #34d399" : "none",
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: "#ECECEC",
                fontWeight: 600,
                fontSize: "0.75rem",
              }}
            >
              {collabStatus === "live"
                ? `${collaboratorsList.length + 1} Online`
                : collabStatus === "reconnecting"
                  ? "Reconnecting…"
                  : "Connecting…"}
            </Typography>
          </Box>

          <Divider
            orientation="vertical"
            flexItem
            sx={{
              borderColor: "rgba(255,255,255,0.15)",
              my: 0.25,
            }}
          />

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
            <Tooltip
              title={`${currentUserInfo.name} (You)`}
              arrow
              placement="bottom"
            >
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
            {collaboratorsList.map((member) => (
              <Tooltip
                key={member.id || member.username}
                title={
                  <Box sx={{ p: 0.25 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, fontSize: "0.8rem" }}
                    >
                      {member.username}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#a1a1aa",
                        fontSize: "0.7rem",
                        display: "block",
                      }}
                    >
                      {member.pointer ? "Active on canvas" : "Online"}
                    </Typography>
                  </Box>
                }
                arrow
                placement="bottom"
              >
                <Avatar
                  sx={{
                    bgcolor: member.color?.background || "#a78bfa",
                    color: "#ffffff",
                    outline: `2px solid ${member.color?.stroke || "#5b21b6"}`,
                    cursor: "pointer",
                    transition: "transform 0.15s ease",
                    "&:hover": {
                      transform: "scale(1.15)",
                      zIndex: 100,
                    },
                  }}
                >
                  {(member.username || "A").charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        </Box>
      )}

      {/* Main Canvas Viewport */}
      <Box
        sx={{
          flexGrow: 1,
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
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