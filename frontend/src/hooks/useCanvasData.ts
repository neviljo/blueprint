import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { getSceneVersion } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasApi } from "../lib/api";
import type { CanvasContent } from "../lib/types";
import type { SceneMessage } from "../collab/sceneSync";

/** A remote scene buffered while the editor is still loading the persisted copy. */
export interface RemoteScene {
  elements: ExcalidrawElement[];
  appState: SceneMessage["appState"];
}

export interface CanvasData {
  loading: boolean;
  initialData: CanvasContent | null;
  workspaceId: string | null;
  /**
   * Canonical in-memory scene, shared with the collaboration layer so both
   * local edits and remote merges mutate a single source of truth.
   */
  currentContentRef: RefObject<CanvasContent>;
  currentSceneVersionRef: RefObject<number>;
  /** Last processed HTTP sync-log sequence number (starts at contentSeq). */
  lastDeltaSeqRef: RefObject<number>;
  pendingRemoteSceneRef: RefObject<RemoteScene | null>;
  receivedSceneRef: RefObject<boolean>;
  loadingRef: RefObject<boolean>;
  /** Records local drawing changes into the shared refs (and scene version). */
  setLocalContent: (
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>
  ) => void;
  /** Persists the full canvas content with debounced retry/backoff. */
  saveCanvasContent: (
    elements: ExcalidrawElement[],
    appState: Partial<AppState>
  ) => Promise<void>;
  /** Immediately pushes any queued (unsaved) content (online/visibility change). */
  flushPendingSave: () => void;
}

/**
 * Loads the persisted canvas and owns the durable-save pipeline.
 *
 * Responsibilities:
 * - fetch initial content via canvasApi.getById (empty canvas when none)
 * - prefer a fresher realtime scene that arrived while loading
 * - save drawing changes via canvasApi.updateContent (debounced upstream)
 * - queue + retry failed saves with exponential backoff
 * - flush queued saves when the network/tab recovers
 * - share the canonical scene refs that the collaboration layer mutates
 */
export function useCanvasData(
  canvasId: string,
  setTheme: (theme: "light" | "dark") => void
): CanvasData {
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<CanvasContent | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const currentContentRef = useRef<CanvasContent>({
    elements: [],
    appState: { theme: "dark" },
  });
  const currentSceneVersionRef = useRef(0);
  const lastDeltaSeqRef = useRef(0);
  const pendingRemoteSceneRef = useRef<RemoteScene | null>(null);
  const receivedSceneRef = useRef(false);
  const loadingRef = useRef(true);

  const pendingSaveRef = useRef<{
    elements: ExcalidrawElement[];
    appState: Partial<AppState>;
  } | null>(null);
  const saveRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRetryCountRef = useRef(0);
  const saveCanvasContentRef = useRef<
    (elements: ExcalidrawElement[], appState: Partial<AppState>) => Promise<void>
  >(async () => {});

  // Load the persisted canvas content. A fresher realtime scene may have
  // arrived (via the collaboration hook) before the HTTP snapshot resolves;
  // that scene wins over the DB snapshot so we never regress to older content.
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

        const remoteScene = pendingRemoteSceneRef.current;
        if (remoteScene) {
          pendingRemoteSceneRef.current = null;
          const scene: CanvasContent = {
            elements: remoteScene.elements,
            appState: { ...remoteScene.appState, viewModeEnabled: false },
          };
          setTheme(remoteScene.appState?.theme === "light" ? "light" : "dark");
          setInitialData(scene);
          currentContentRef.current = scene;
        } else if (parsedContent) {
          const loadedAppState = { ...(parsedContent.appState || {}) };
          const savedTheme = loadedAppState.theme === "light" ? "light" : "dark";
          const scene: CanvasContent = {
            elements: parsedContent.elements || [],
            appState: { ...loadedAppState, viewModeEnabled: false },
          };
          setTheme(savedTheme);
          setInitialData(scene);
          currentContentRef.current = scene;
        } else {
          setTheme("dark");
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
        setTheme("dark");
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
  }, [canvasId, setTheme]);

  /** Records local drawing changes into the shared scene refs. */
  const setLocalContent = useCallback(
    (elements: readonly ExcalidrawElement[], appState: Partial<AppState>) => {
      currentContentRef.current = { elements: [...elements], appState };
      currentSceneVersionRef.current = getSceneVersion(elements);
    },
    []
  );

  // Save content to the backend API. On failure the newest state is queued and
  // retried with exponential backoff so the latest content always reaches the
  // backend once the network recovers.
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
        // Save succeeded — clear any queued retry state.
        pendingSaveRef.current = null;
        saveRetryCountRef.current = 0;
        if (saveRetryTimerRef.current) {
          clearTimeout(saveRetryTimerRef.current);
          saveRetryTimerRef.current = null;
        }
      } catch (err) {
        console.warn("Failed to save canvas content to backend:", err);
        // Keep the newest unsaved state and retry with exponential backoff.
        pendingSaveRef.current = {
          elements: [...elements],
          appState: cleanAppState,
        };
        if (!saveRetryTimerRef.current) {
          const attempt = saveRetryCountRef.current++;
          const delay = Math.min(2000 * 2 ** attempt, 30000);
          saveRetryTimerRef.current = setTimeout(() => {
            saveRetryTimerRef.current = null;
            const pending = pendingSaveRef.current;
            if (pending) {
              saveCanvasContentRef.current(pending.elements, pending.appState);
            } else {
              saveRetryCountRef.current = 0;
            }
          }, delay);
        }
      }
    },
    [canvasId]
  );
  // Keep the retry timer able to reach the latest saveCanvasContent identity.
  useEffect(() => {
    saveCanvasContentRef.current = saveCanvasContent;
  });

  /** Immediately push any queued (unsaved) content once the network is back or
   *  the tab becomes visible again. */
  const flushPendingSave = useCallback(() => {
    if (saveRetryTimerRef.current) {
      clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = null;
    }
    saveRetryCountRef.current = 0;
    const pending = pendingSaveRef.current;
    if (pending) {
      pendingSaveRef.current = null;
      saveCanvasContent(pending.elements, pending.appState);
    }
  }, [saveCanvasContent]);

  // Drop stale save state when the canvas changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (saveRetryTimerRef.current) {
        clearTimeout(saveRetryTimerRef.current);
        saveRetryTimerRef.current = null;
      }
      pendingSaveRef.current = null;
      saveRetryCountRef.current = 0;
    };
  }, [canvasId]);

  return {
    loading,
    initialData,
    workspaceId,
    currentContentRef,
    currentSceneVersionRef,
    lastDeltaSeqRef,
    pendingRemoteSceneRef,
    receivedSceneRef,
    loadingRef,
    setLocalContent,
    saveCanvasContent,
    flushPendingSave,
  };
}