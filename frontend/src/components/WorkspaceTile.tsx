import { useState } from "react";
import {
  Card,
  CardActionArea,
  Box,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import { Link } from "@tanstack/react-router";

interface WorkspaceTileProps {
  id: string;
  name: string;
  canvases: number;
  onDelete?: (id: string) => void;
}

export default function WorkspaceTile({
  id,
  name,
  canvases,
  onDelete,
}: WorkspaceTileProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOpenConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleMenuClose();
    setConfirmOpen(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(false);
    if (onDelete) {
      onDelete(id);
    }
  };

  return (
    <>
      <Box sx={{ position: "relative", width: 280 }}>
        <Link
          to="/dashboard/workspaces/$workspaceId"
          params={{ workspaceId: id }}
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Card
            elevation={0}
            sx={{
              width: "100%",
              borderRadius: 3,
              bgcolor: "#000",
              border: "1px solid #242424",
              transition: "all .18s ease",
              "&:hover": {
                borderColor: "#3c3c3c",
                transform: "translateY(-2px)",
                cursor: "pointer",
              },
            }}
          >
            <CardActionArea component="div" sx={{ p: 2.5 }}>
              {/* Top Row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2,
                    bgcolor: "#111",
                    border: "1px solid #222",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FolderRoundedIcon sx={{ color: "#3ECF8E" }} />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={`${canvases}`}
                    size="small"
                    sx={{
                      bgcolor: "#151515",
                      color: "#999",
                      border: "1px solid #252525",
                    }}
                  />

                  <IconButton
                    size="small"
                    onClick={handleMenuOpen}
                    sx={{
                      color: "#777",
                      "&:hover": { color: "#ECECEC", bgcolor: "#222" },
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              {/* Title */}
              <Typography sx={{ fontWeight: 600, fontSize: 17 }}>
                {name}
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>
                {canvases} canvases
              </Typography>

              {/* Bottom */}
              <Box
                sx={{
                  mt: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "#3ECF8E",
                  }}
                />

                <Typography variant="caption" color="text.secondary">
                  Active
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        </Link>
      </Box>

      {/* Workspace Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1A1A1A",
              border: "1px solid #2F2F2F",
              color: "#ECECEC",
              minWidth: 150,
            },
          },
        }}
      >
        <MenuItem onClick={handleOpenConfirm} sx={{ color: "#EF4444" }}>
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" sx={{ color: "#EF4444" }} />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onClick={(e) => e.stopPropagation()}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1A1A1A",
              border: "1px solid #2F2F2F",
              color: "#ECECEC",
            },
          },
        }}
      >
        <DialogTitle>Delete Workspace</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "#A6A6A6" }}>
            Are you sure you want to delete <strong>"{name}"</strong>? All associated canvases will be permanently removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} sx={{ color: "#A6A6A6" }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            sx={{
              bgcolor: "#EF4444",
              color: "#FFF",
              fontWeight: 700,
              "&:hover": { bgcolor: "#DC2626" },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}