import { useState, useEffect, useRef, useCallback } from "react";
import { Box, IconButton, Tooltip, CircularProgress } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useNavigate } from "@tanstack/react-router";
import { canvasApi } from "../lib/api";
import type { CanvasContent } from "../lib/types";

interface CanvasWorkspaceProps {
  canvasId: string;
}

export default function CanvasWorkspace({ canvasId }: CanvasWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<CanvasContent | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState<"dark" | "light">("dark");
  const isLight = editorTheme === "light";

  const navigate = useNavigate();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const currentContentRef = useRef<CanvasContent>({
    elements: [],
    appState: { theme: "dark" },
  });

  // Fetch initial canvas data from backend API
  useEffect(() => {
    async function loadCanvas() {
      try {
        setLoading(true);
        const data = await canvasApi.getById(canvasId);
        if (data) {
          if (data.workspaceId) setWorkspaceId(data.workspaceId);

          let parsedContent: CanvasContent | null = null;
          if (data.content && typeof data.content === "string") {
            try {
              parsedContent = JSON.parse(data.content) as CanvasContent;
            } catch {
              parsedContent = null;
            }
          } else if (data.content && typeof data.content === "object") {
            parsedContent = data.content;
          }

          if (parsedContent) {
            const loadedAppState = { ...(parsedContent.appState || {}) };
            const savedTheme =
              loadedAppState.theme === "light" ? "light" : "dark";
            const initialAppState = {
              ...loadedAppState,
              viewModeEnabled: false,
            };

            setEditorTheme(savedTheme);
            setInitialData({
              elements: parsedContent.elements || [],
              appState: initialAppState,
            });
            currentContentRef.current = {
              elements: parsedContent.elements || [],
              appState: initialAppState,
            };
          } else {
            setEditorTheme("dark");
            setInitialData({
              elements: [],
              appState: { theme: "dark", viewModeEnabled: false },
            });
          }
        }
      } catch (err) {
        console.warn("Could not fetch canvas data from backend, initializing empty:", err);
        setEditorTheme("dark");
        setInitialData({
          elements: [],
          appState: { theme: "dark", viewModeEnabled: false },
        });
      } finally {
        setLoading(false);
      }
    }

    if (canvasId) {
      loadCanvas();
    }
  }, [canvasId]);

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

  // Handle canvas drawing changes with debounced auto-save
  const handleChange = (
    elements: readonly ExcalidrawElement[],
    appState: AppState
  ) => {
    currentContentRef.current = {
      elements: [...elements],
      appState,
    };

    setEditorTheme(appState.theme === "light" ? "light" : "dark");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveCanvasContent([...elements], appState);
    }, 1500);
  };

  // Capture the Excalidraw imperative API (refs are unsupported since v0.17)
  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawRef.current = api;
  }, []);

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
