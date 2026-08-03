import { Dialog, IconButton, Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AuthForm from "./AuthForm";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
}

export default function AuthModal({
  open,
  onClose,
  initialMode = "signin",
}: AuthModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: "transparent",
            boxShadow: "none",
            maxHeight: "92vh",
            m: { xs: 1, sm: 2 },
          },
        },
        backdrop: {
          sx: {
            backdropFilter: "blur(6px)",
            bgcolor: "rgba(0, 0, 0, 0.75)",
          },
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <IconButton
          onClick={onClose}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10,
            bgcolor: "#2F2F2F",
            color: "#ECECEC",
            border: "1px solid #3F3F3F",
            "&:hover": {
              bgcolor: "#3A3A3A",
            },
          }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        <AuthForm
          initialMode={initialMode}
          onSuccess={onClose}
        />
      </Box>
    </Dialog>
  );
}
