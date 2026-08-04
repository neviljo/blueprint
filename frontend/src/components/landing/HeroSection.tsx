import {
  Box,
  Container,
  Typography,
  Button,
  Chip,
  Avatar,
  AvatarGroup,
  Stack,
} from "@mui/material";
import { Link as RouterLink } from "@tanstack/react-router";
import {
  ArrowForward,
  AutoAwesome,
  DashboardOutlined,
} from "@mui/icons-material";

export interface HeroSectionProps {
  onOpenAuth: (mode: "signin" | "signup") => void;
}

export default function HeroSection({ onOpenAuth }: HeroSectionProps) {
  return (
    <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 8, md: 10 } }}>
      <Box sx={{ textAlign: "center", maxWidth: 860, mx: "auto" }}>
        <Chip
          icon={<AutoAwesome sx={{ fontSize: "1rem !important", color: "#c084fc" }} />}
          label="Introducing Blueprint • Next-Gen Visual Workspaces"
          onClick={() => onOpenAuth("signup")}
          sx={{
            bgcolor: "rgba(192, 132, 252, 0.1)",
            color: "#c084fc",
            border: "1px solid rgba(192, 132, 252, 0.3)",
            fontWeight: 600,
            fontSize: "0.85rem",
            px: 1,
            py: 2.2,
            mb: 4,
            cursor: "pointer",
            "&:hover": { bgcolor: "rgba(192, 132, 252, 0.18)" },
          }}
        />

        <Typography
          variant="h2"
          sx={{
            fontWeight: 800,
            fontSize: { xs: "2.3rem", sm: "3.5rem", md: "4.2rem" },
            lineHeight: 1.1,
            letterSpacing: "-1.8px",
            mb: 3,
            color: "#FFFFFF",
          }}
        >
          Architect, Diagram & Build Ideas at the Speed of Thought
        </Typography>

        <Typography
          variant="h6"
          sx={{
            color: "#A6A6A6",
            fontWeight: 400,
            fontSize: { xs: "1rem", sm: "1.2rem" },
            lineHeight: 1.6,
            mb: 4,
            maxWidth: 700,
            mx: "auto",
          }}
        >
          The collaborative Excalidraw whiteboarding workspace. Group your canvases into structured
          workspaces, design system diagrams, and build together in real time.
        </Typography>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "center", alignItems: "center", mb: 6 }}
        >
          <Button
            variant="contained"
            size="large"
            onClick={() => onOpenAuth("signup")}
            endIcon={<ArrowForward />}
            sx={{
              bgcolor: "#ECECEC",
              color: "#111",
              fontWeight: 700,
              fontSize: "1rem",
              px: 3.5,
              py: 1.5,
              borderRadius: 2.5,
              textTransform: "none",
              boxShadow: "0 8px 24px rgba(255, 255, 255, 0.15)",
              "&:hover": { bgcolor: "#FFFFFF", boxShadow: "0 10px 28px rgba(255, 255, 255, 0.25)" },
            }}
          >
            Start Building Free
          </Button>

          <Button
            component={RouterLink}
            to="/dashboard"
            variant="outlined"
            size="large"
            startIcon={<DashboardOutlined />}
            sx={{
              color: "#ECECEC",
              borderColor: "#3F3F3F",
              bgcolor: "#1A1A1A",
              fontWeight: 600,
              fontSize: "1rem",
              px: 3.5,
              py: 1.5,
              borderRadius: 2.5,
              textTransform: "none",
              "&:hover": { bgcolor: "#262626", borderColor: "#555" },
            }}
          >
            Open Dashboard
          </Button>
        </Stack>

        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 2, bgcolor: "#1A1A1A", px: 2.5, py: 1, borderRadius: 10, border: "1px solid #2B2B2B" }}>
          <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 30, height: 30, fontSize: "0.75rem" } }}>
            <Avatar alt="Alex" src="https://i.pravatar.cc/100?img=33" />
            <Avatar alt="Sarah" src="https://i.pravatar.cc/100?img=47" />
            <Avatar alt="David" src="https://i.pravatar.cc/100?img=12" />
            <Avatar alt="Elena" src="https://i.pravatar.cc/100?img=25" />
          </AvatarGroup>
          <Typography variant="body2" sx={{ color: "#A6A6A6", fontSize: "0.85rem" }}>
            Trusted by <strong>10,000+</strong> engineers & product designers
          </Typography>
        </Box>
      </Box>
    </Container>
  );
}
