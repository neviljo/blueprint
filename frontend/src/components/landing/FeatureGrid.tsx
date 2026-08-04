import { Box, Container, Typography, Paper } from "@mui/material";
import {
  BrushOutlined,
  FolderOutlined,
  GroupOutlined,
  CodeOutlined,
} from "@mui/icons-material";

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        height: "100%",
        bgcolor: "#1A1A1A",
        border: "1px solid #2B2B2B",
        borderRadius: 3,
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          transform: "translateY(-4px)",
          borderColor: "#444444",
          bgcolor: "#202020",
        },
      }}
    >
      <Box sx={{ mb: 2 }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: "#FFFFFF", fontSize: "1.1rem" }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "#A6A6A6", lineHeight: 1.6 }}>
        {description}
      </Typography>
    </Paper>
  );
}

export default function FeatureGrid() {
  return (
    <Container maxWidth="lg" id="features" sx={{ pb: 12 }}>
      <Box sx={{ textAlign: "center", mb: 8 }}>
        <Typography variant="caption" sx={{ color: "#c084fc", fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
          POWERFUL FEATURES
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, color: "#FFFFFF" }}>
          Everything You Need for Visual Engineering
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
          gap: 3,
        }}
      >
        <FeatureCard
          icon={<BrushOutlined sx={{ color: "#3B82F6", fontSize: 28 }} />}
          title="Infinite Excalidraw Canvas"
          description="Seamless hand-drawn feel combined with vector precision for fast wireframing and architecture diagrams."
        />

        <FeatureCard
          icon={<FolderOutlined sx={{ color: "#10B981", fontSize: 28 }} />}
          title="Workspace Hierarchy"
          description="Organize your Excalidraw whiteboards by project, client, or team folder with granular permissions."
        />

        <FeatureCard
          icon={<GroupOutlined sx={{ color: "#F59E0B", fontSize: 28 }} />}
          title="Multiplayer Sync"
          description="Work live with your team with instant live cursor sync, multi-user selection, and comment threads."
        />

        <FeatureCard
          icon={<CodeOutlined sx={{ color: "#EC4899", fontSize: 28 }} />}
          title="Developer Export"
          description="Export diagrams instantly as SVGs, PNGs, raw JSON, or clean React component snippets."
        />
      </Box>
    </Container>
  );
}
