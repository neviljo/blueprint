import { Box, Button, Tooltip } from "@mui/material";
import {
  Google as GoogleIcon,
  GitHub as GitHubIcon,
} from "@mui/icons-material";

function renderSocialButton(label: string, icon: React.ReactNode) {
  return (
    <Tooltip title={`${label} coming soon`} placement="top">
      <span>
        <Button
          fullWidth
          variant="outlined"
          startIcon={icon}
          disabled
          sx={{
            py: 0.9,
            color: "#ECECEC",
            borderColor: "#3F3F3F",
            bgcolor: "#212121",
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.9rem",
            borderRadius: 2,
          }}
        >
          Continue with {label}
        </Button>
      </span>
    </Tooltip>
  );
}

export default function SocialLoginButtons() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2, mb: 2 }}>
      {renderSocialButton(
        "Google",
        <GoogleIcon sx={{ fontSize: "1.1rem !important", color: "#4285F4" }} />
      )}

      {renderSocialButton(
        "GitHub",
        <GitHubIcon sx={{ fontSize: "1.1rem !important" }} />
      )}
    </Box>
  );
}
