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
import WorkspaceTile from "./WorkspaceTile";
import { workspaceApi } from "../lib/api";

interface WorkspaceItem {
  id: string;
  name: string;
  canvases: number;
}

export default function WorkspaceDashboard() {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");

  // Fetch workspaces from backend API on mount
  useEffect(() => {
    async function loadWorkspaces() {
      try {
        setLoading(true);
        const data = await workspaceApi.getAll();
        if (Array.isArray(data)) {
          setWorkspaces(
            data.map((w) => ({
              id: w.id,
              name: w.name,
              canvases: w.canvasesCount || 0,
            }))
          );
        }
      } catch (err) {
        console.warn("Could not load workspaces from backend API:", err);
        setError("Could not load workspaces.");
      } finally {
        setLoading(false);
      }
    }

    loadWorkspaces();
  }, []);

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) return;

    const name = workspaceName.trim();

    try {
      const newWs = await workspaceApi.create(name);
      setWorkspaces((prev) => [
        ...prev,
        {
          id: newWs.id,
          name: newWs.name || name,
          canvases: 0,
        },
      ]);
      setError(null);
      setWorkspaceName("");
      setOpen(false);
    } catch (err) {
      console.warn("Backend API workspace creation failed:", err);
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    try {
      await workspaceApi.delete(id);
    } catch (err) {
      console.warn("Backend API workspace deletion failed, removing locally:", err);
    }
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
  };

  return (
    <>
      <Box
        sx={{
          width: "100%",
          maxWidth: 1450,
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
              sx={{
                fontWeight: 700,
              }}
            >
              Workspaces
            </Typography>

            <Typography
              sx={{
                color: "text.secondary",
                mt: 0.8,
              }}
            >
              Organize your Excalidraw canvases.
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
            New Workspace
          </Button>
        </Box>

        {/* Loading Indicator */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} sx={{ color: "#ECECEC" }} />
          </Box>
        )}

        {/* Workspace Grid */}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, 270px)",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {workspaces.map((workspace) => (
            <WorkspaceTile
              key={workspace.id}
              id={workspace.id}
              name={workspace.name}
              canvases={workspace.canvases}
              onDelete={handleDeleteWorkspace}
            />
          ))}
        </Box>
      </Box>

      {/* Create Workspace Dialog */}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Create Workspace</DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}

          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label="Workspace Name"
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateWorkspace();
              }
            }}
          />
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setWorkspaceName("");
              setError(null);
              setOpen(false);
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleCreateWorkspace}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}