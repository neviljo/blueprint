import { Box, Container, Typography, Paper, Stack } from "@mui/material";
import { CheckCircleRounded } from "@mui/icons-material";

function WorkspaceCard({ title, canvases, color }: { title: string; canvases: number; color: string }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        bgcolor: "#212121",
        border: "1px solid #333333",
        borderRadius: 2.5,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#FFFFFF" }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "#A6A6A6" }}>
        {canvases} Canvases
      </Typography>
    </Paper>
  );
}

function WorkspaceFeatureItem({ text }: { text: string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <CheckCircleRounded sx={{ color: "#10B981", fontSize: 20 }} />
      <Typography variant="body2" sx={{ color: "#ECECEC", fontSize: "0.95rem" }}>
        {text}
      </Typography>
    </Stack>
  );
}

export default function WorkspacesSection() {
  return (
    <Container maxWidth="lg" id="workspaces" sx={{ pb: 12 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, md: 6 },
          bgcolor: "#18181B",
          border: "1px solid #27272A",
          borderRadius: 4,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 4,
            alignItems: "center",
          }}
        >
          <Box>
            <Typography variant="caption" sx={{ color: "#10B981", fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
              STRUCTURED WORKSPACES
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, mb: 2, color: "#FFFFFF" }}>
              Organize Your Whiteboards Effortlessly
            </Typography>
            <Typography variant="body1" sx={{ color: "#A6A6A6", mb: 4, lineHeight: 1.7 }}>
              Keep your team focused with dedicated workspaces for Marketing, Product Roadmaps, Design Systems, and Backend Architecture.
            </Typography>

            <Stack spacing={2}>
              <WorkspaceFeatureItem text="Instant searching across all canvas tiles and tags" />
              <WorkspaceFeatureItem text="Custom canvas templates for system design & sprint planning" />
              <WorkspaceFeatureItem text="Export & share workspace links with client view-only permissions" />
            </Stack>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 2,
            }}
          >
            <WorkspaceCard title="Marketing" canvases={12} color="#3B82F6" />
            <WorkspaceCard title="Design System" canvases={14} color="#EC4899" />
            <WorkspaceCard title="Product Roadmap" canvases={9} color="#F59E0B" />
            <WorkspaceCard title="Backend Infra" canvases={25} color="#10B981" />
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
