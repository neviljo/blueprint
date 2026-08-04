import { useState } from "react";
import {
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
import type { SxProps, Theme } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";

interface TileActionsProps {
  name: string;
  onDelete: () => void;
  resourceType: "workspace" | "canvas";
  iconSx?: SxProps<Theme>;
}

const menuPaperSx = {
  bgcolor: "#1A1A1A",
  border: "1px solid #2F2F2F",
  color: "#ECECEC",
  minWidth: 150,
};

const dialogPaperSx = {
  bgcolor: "#1A1A1A",
  border: "1px solid #2F2F2F",
  color: "#ECECEC",
};

export default function TileActions({
  name,
  onDelete,
  resourceType,
  iconSx,
}: TileActionsProps) {
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
    onDelete();
  };

  return (
    <>
      <IconButton size="small" onClick={handleMenuOpen} sx={iconSx}>
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          paper: { sx: menuPaperSx },
        }}
      >
        <MenuItem onClick={handleOpenConfirm} sx={{ color: "#EF4444" }}>
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" sx={{ color: "#EF4444" }} />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onClick={(e) => e.stopPropagation()}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: { sx: dialogPaperSx },
        }}
      >
        <DialogTitle>
          {resourceType === "workspace" ? "Delete Workspace" : "Delete Canvas"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "#A6A6A6" }}>
            {resourceType === "workspace" ? (
              <>
                Are you sure you want to delete{" "}
                <strong>"{name}"</strong>? All associated canvases will be
                permanently removed.
              </>
            ) : (
              <>
                Are you sure you want to delete canvas <strong>"{name}"</strong>
                ? This action cannot be undone.
              </>
            )}
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
