import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import { workspaceApi } from "../lib/api";
import type { WorkspaceMember } from "../lib/api";

const dialogPaperSx = {
  bgcolor: "#1A1A1A",
  border: "1px solid #2F2F2F",
  color: "#ECECEC",
  minHeight: 320,
};

interface WorkspaceMembersDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
}

export default function WorkspaceMembersDialog({
  open,
  workspaceId,
  onClose,
}: WorkspaceMembersDialogProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await workspaceApi.getMembers(workspaceId);
      if (Array.isArray(data)) {
        setMembers(data);
      }
    } catch (err) {
      console.warn("Could not load workspace members:", err);
      setError(err instanceof Error ? err.message : "Could not load members.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      loadMembers();
    }
  }, [open, loadMembers]);

  const handleAdd = async () => {
    const value = email.trim();
    if (!value) return;

    try {
      const member = await workspaceApi.addMember(workspaceId, value);
      setMembers((prev) =>
        prev.some((m) => m.userId === member.userId) ? prev : [...prev, member]
      );
      setEmail("");
      setError(null);
    } catch (err) {
      console.warn("Could not add workspace member:", err);
      setError(err instanceof Error ? err.message : "Could not add member.");
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await workspaceApi.removeMember(workspaceId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      setError(null);
    } catch (err) {
      console.warn("Could not remove workspace member:", err);
      setError(err instanceof Error ? err.message : "Could not remove member.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: { sx: dialogPaperSx },
      }}
    >
      <DialogTitle>Workspace Members</DialogTitle>

      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            sx={{ color: "#FCA5A5" }}
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} sx={{ color: "#ECECEC" }} />
          </Box>
        ) : (
          <List disablePadding sx={{ maxHeight: 280, overflowY: "auto" }}>
            {members.map((member) => (
              <ListItem
                key={member.userId}
                sx={{ px: 0, gap: 1.5, "&:hover .remove-member": { opacity: 1 } }}
                secondaryAction={
                  member.role === "member" ? (
                    <IconButton
                      className="remove-member"
                      size="small"
                      onClick={() => handleRemove(member.userId)}
                      sx={{
                        color: "#A6A6A6",
                        opacity: 0.4,
                        "&:hover": { color: "#EF4444" },
                      }}
                    >
                      <PersonRemoveRoundedIcon fontSize="small" />
                    </IconButton>
                  ) : undefined
                }
              >
                <ListItemAvatar>
                  <Avatar
                    src={member.image ?? undefined}
                    sx={{
                      bgcolor: "#222",
                      color: "#ECECEC",
                      border: "1px solid #2F2F2F",
                    }}
                  >
                    {member.name?.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>

                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{member.name}</Typography>
                      {member.role === "owner" && (
                        <Chip
                          label="Owner"
                          size="small"
                          sx={{
                            bgcolor: "#151515",
                            color: "#4ADE80",
                            border: "1px solid #1F3A2E",
                            height: 20,
                            fontSize: 11,
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={<span style={{ color: "#A6A6A6" }}>{member.email}</span>}
                />
              </ListItem>
            ))}
          </List>
        )}

        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            autoFocus
            label="Add by email"
            placeholder="collaborator@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAdd();
              }
            }}
            slotProps={{
              input: { sx: { color: "#ECECEC" } },
              inputLabel: { sx: { color: "#A6A6A6" } },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                "& fieldset": { borderColor: "#2F2F2F" },
                "&:hover fieldset": { borderColor: "#3c3c3c" },
              },
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={handleAdd}
            sx={{
              bgcolor: "#3ECF8E",
              color: "#00150B",
              fontWeight: 700,
              textTransform: "none",
              px: 2.5,
              py: 1,
              minHeight: 40,
              "&:hover": { bgcolor: "#35B57B" },
            }}
          >
            Add
          </Button>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ color: "#A6A6A6" }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}