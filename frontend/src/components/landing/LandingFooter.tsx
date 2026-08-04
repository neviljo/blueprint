import { Box, Container, Typography, Stack, Divider } from "@mui/material";
import { Link as RouterLink } from "@tanstack/react-router";
import { footerLinkStyle } from "./styles";

export default function LandingFooter() {
  return (
    <Box component="footer" sx={{ borderTop: "1px solid #222222", py: 6, bgcolor: "#0A0A0A" }}>
      <Container maxWidth="lg">
        <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 4, mb: 4 }}>
          <Box sx={{ maxWidth: 300 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  bgcolor: "#ECECEC",
                  color: "#111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                }}
              >
                B
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                Blueprint
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: "#777777" }}>
              Next-gen Excalidraw whiteboarding and workspace manager for modern teams.
            </Typography>
          </Box>

          <Stack direction="row" spacing={6}>
            <Box>
              <Typography variant="subtitle2" sx={{ color: "#FFFFFF", fontWeight: 700, mb: 1.5 }}>
                Product
              </Typography>
              <Stack spacing={1}>
                <Box component={RouterLink} to="/dashboard" sx={footerLinkStyle}>Dashboard</Box>
                <Box component={RouterLink} to="/signin" sx={footerLinkStyle}>Sign In</Box>
                <Box component={RouterLink} to="/signup" sx={footerLinkStyle}>Sign Up</Box>
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ color: "#FFFFFF", fontWeight: 700, mb: 1.5 }}>
                System
              </Typography>
              <Stack spacing={1}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#10B981", fontSize: "0.85rem", fontWeight: 600 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#10B981" }} />
                  All Systems Operational
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ borderColor: "#1A1A1A", mb: 3 }} />

        <Typography variant="body2" sx={{ color: "#555555", textAlign: "center" }}>
          © {new Date().getFullYear()} Blueprint Inc. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}
