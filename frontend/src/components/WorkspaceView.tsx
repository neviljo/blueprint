import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
} from "@mui/material";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CanvasTile from "./CanvasTile";
import { canvasApi, workspaceApi } from "../lib/api";
import type { Canvas } from "../lib/api";

interface CanvasItem {
  id: string;
  name: string;
  objects: number;
}

interface Props {
  workspaceId: string;
}

function countObjects(content: Canvas["content"]): number {
  if (!content) return 0;
  if (typeof content === "string") {
    try {
      return countObjects(JSON.parse(content));
    } catch {
      return 0;
    }
  }
  return content.elements?.length ?? 0;
}

export default function WorkspaceView({
  workspaceId,
}: Props) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [canvases, setCanvases] = useState<CanvasItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasName, setCanvasName] = useState("");

  useEffect(() => {
    workspaceApi
      .getById(workspaceId)
      .then((w) => setWorkspaceName(w.name))
      .catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    async function loadCanvases() {
      try {
        setLoading(true);
        const data = await canvasApi.getByWorkspace(workspaceId);
        if (Array.isArray(data)) {
          setCanvases(
            data.map((c) => ({
              id: c.id,
              name: c.name,
              objects: countObjects(c.content),
            }))
          );
        }
      } catch (err) {
        console.warn("Could not fetch canvases from backend API:", err);
        setError("Could not load canvases.");
      } finally {
        setLoading(false);
      }
    }

    if (workspaceId) {
      loadCanvases();
    }
  }, [workspaceId]);

  const createCanvas = async () => {
    if (!canvasName.trim()) return;

    const name = canvasName.trim();

    try {
      const newCanvas = await canvasApi.create(name, workspaceId);
      setCanvases((prev) => [
        ...prev,
        {
          id: newCanvas.id,
          name: newCanvas.name || name,
          objects: 0,
        },
      ]);
      setError(null);
      setCanvasName("");
      setOpen(false);
    } catch (err) {
      console.warn("Backend API canvas creation failed:", err);
      setError(err instanceof Error ? err.message : "Could not create canvas.");
    }
  };

  const handleDeleteCanvas = async (id: string) => {
    try {
      await canvasApi.delete(id);
    } catch (err) {
      console.warn("Backend API canvas deletion failed, removing locally:", err);
    }
    setCanvases((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <>
      <Box
        sx={{
          width: "100%",
          maxWidth: 1500,
          mx: "auto",
          px: 4,
          py: 3,
        }}
      >
        {/* Header */}

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{ fontWeight: 700 }}
            >
              {workspaceName}
            </Typography>

            <Typography
              color="text.secondary"
              sx={{ mt: 0.8 }}
            >
              {canvases.length} canvases
            </Typography>
          </Box>

          <Button
            startIcon={<AddRoundedIcon />}
            onClick={() => setOpen(true)}
            sx={{
              bgcolor: "#000",
              color: "#ECECEC",
              border: "1px solid #1f1f1f",
              borderRadius: 2,
              px: 2.5,
              py: 1,
              textTransform: "none",

              "&:hover": {
                bgcolor: "#0a0a0a",
                borderColor: "#3c3c3c",
              },
            }}
          >
            New Canvas
          </Button>
        </Box>

        {/* Loading */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} sx={{ color: "#ECECEC" }} />
          </Box>
        )}

        {/* Canvas Grid */}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, 300px)",
            justifyContent: "center",
            gap: 3,
          }}
        >
          {canvases.map((canvas) => (
            <CanvasTile
              key={canvas.id}
              id={canvas.id}
              name={canvas.name}
              objects={canvas.objects}
              onDelete={handleDeleteCanvas}
            />
          ))}
        </Box>
      </Box>

      {/* Create Canvas Dialog */}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>New Canvas</DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            autoFocus
            margin="normal"
            label="Canvas Name"
            value={canvasName}
            onChange={(e) => {
              setCanvasName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                createCanvas();
              }
            }}
          />
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setCanvasName("");
              setError(null);
              setOpen(false);
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={createCanvas}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}