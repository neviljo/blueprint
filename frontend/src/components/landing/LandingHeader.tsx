import { Box, Container, Stack, Button, Typography } from "@mui/material";
import { Link as RouterLink } from "@tanstack/react-router";
import { navLinkStyle } from "./styles";

export interface LandingHeaderProps {
  onOpenAuth: (mode: "signin" | "signup") => void;
}

export default function LandingHeader({ onOpenAuth }: LandingHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        backdropFilter: "blur(12px)",
        bgcolor: "rgba(0, 0, 0, 0.85)",
        borderBottom: "1px solid #262626",
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 72,
          }}
        >
          <Box
            component={RouterLink}
            to="/"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              textDecoration: "none",
              color: "#ECECEC",
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                bgcolor: "#ECECEC",
                color: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 20,
                boxShadow: "0 0 16px rgba(255, 255, 255, 0.15)",
              }}
            >
              B
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              Blueprint
            </Typography>
          </Box>

          <Stack direction="row" spacing={4} sx={{ display: { xs: "none", md: "flex" } }}>
            <Box component="a" href="#features" sx={navLinkStyle}>
              Features
            </Box>
            <Box component="a" href="#canvas-demo" sx={navLinkStyle}>
              Interactive Canvas
            </Box>
            <Box component="a" href="#workspaces" sx={navLinkStyle}>
              Workspaces
            </Box>
            <Box component="a" href="#pricing" sx={navLinkStyle}>
              Pricing
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Button
              onClick={() => onOpenAuth("signin")}
              sx={{
                color: "#ECECEC",
                textTransform: "none",
                fontWeight: 600,
                px: 2,
                "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
              }}
            >
              Sign In
            </Button>

            <Button
              variant="contained"
              onClick={() => onOpenAuth("signup")}
              sx={{
                bgcolor: "#ECECEC",
                color: "#111",
                fontWeight: 700,
                textTransform: "none",
                px: 2.5,
                borderRadius: 2,
                "&:hover": { bgcolor: "#FFFFFF" },
              }}
            >
              Get Started
            </Button>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
