import { useState } from "react";
import { createFileRoute, Link as RouterLink, redirect } from "@tanstack/react-router";
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Chip,
  Avatar,
  AvatarGroup,
  Stack,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import {
  DashboardOutlined,
  BrushOutlined,
  FolderOutlined,
  GroupOutlined,
  CodeOutlined,
  ArrowForward,
  CheckCircleRounded,
  CropSquareOutlined,
  RadioButtonUncheckedOutlined,
  TextFieldsOutlined,
  StickyNote2Outlined,
  PanToolOutlined,
  DeleteOutlineRounded,
  AutoAwesome,
} from "@mui/icons-material";
import AuthModal from "../components/AuthModal";
import { getCurrentSession } from "../lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getCurrentSession();
    if (session?.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LandingPage,
});

interface CanvasShape {
  id: number;
  type: "rect" | "circle" | "text" | "note";
  x: number;
  y: number;
  label: string;
  color: string;
}

function LandingPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");

  // Interactive Demo Canvas State
  const [activeTool, setActiveTool] = useState<"select" | "rect" | "circle" | "text" | "note">("rect");
  const [shapes, setShapes] = useState<CanvasShape[]>([
    { id: 1, type: "rect", x: 50, y: 40, label: "Auth Service API", color: "#3B82F6" },
    { id: 2, type: "circle", x: 270, y: 40, label: "PostgreSQL DB", color: "#10B981" },
    { id: 3, type: "note", x: 160, y: 150, label: "💡 Use Redis for caching", color: "#F59E0B" },
    { id: 4, type: "text", x: 60, y: 240, label: "// Blueprint Whiteboard Canvas", color: "#EC4899" },
  ]);

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === "select") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(20, Math.min(rect.width - 180, e.clientX - rect.left - 50));
    const y = Math.max(20, Math.min(rect.height - 80, e.clientY - rect.top - 20));

    const labels = {
      rect: "Microservice Node",
      circle: "Cache / Storage",
      text: "Component State",
      note: "✏️ Live note element",
    };

    const colors = ["#8B5CF6", "#EC4899", "#3B82F6", "#10B981", "#F59E0B"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newShape: CanvasShape = {
      id: Date.now(),
      type: activeTool,
      x,
      y,
      label: labels[activeTool],
      color: randomColor,
    };

    setShapes((prev) => [...prev, newShape]);
  };

  const clearCanvas = () => {
    setShapes([]);
  };

  return (
    <Box sx={{ bgcolor: "#000", color: "#ECECEC", minHeight: "100vh", overflowX: "hidden" }}>
      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
      />

      {/* Header Navigation */}
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
            {/* Brand Logo */}
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

            {/* Nav Links */}
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

            {/* Actions */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Button
                onClick={() => openAuth("signin")}
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
                onClick={() => openAuth("signup")}
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

      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 8, md: 10 } }}>
        <Box sx={{ textAlign: "center", maxWidth: 860, mx: "auto" }}>
          {/* Pill Badge */}
          <Chip
            icon={<AutoAwesome sx={{ fontSize: "1rem !important", color: "#c084fc" }} />}
            label="Introducing Blueprint • Next-Gen Visual Workspaces"
            onClick={() => openAuth("signup")}
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
              onClick={() => openAuth("signup")}
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

          {/* Social Proof Avatars */}
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

      {/* Interactive Live Whiteboard Demo Sandbox */}
      <Container maxWidth="lg" id="canvas-demo" sx={{ pb: 12 }}>
        <Paper
          elevation={0}
          sx={{
            bgcolor: "#171717",
            border: "1px solid #2E303A",
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
          }}
        >
          {/* Canvas Window Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 3,
              py: 1.8,
              borderBottom: "1px solid #262626",
              bgcolor: "#141414",
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "#EF4444" }} />
              <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "#F59E0B" }} />
              <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "#10B981" }} />
              <Typography variant="body2" sx={{ color: "#A6A6A6", ml: 2, fontWeight: 600 }}>
                Interactive Whiteboard Preview • Click below to add elements!
              </Typography>
            </Stack>

            {/* Toolbar */}
            <Stack direction="row" spacing={0.5} sx={{ bgcolor: "#212121", p: 0.5, borderRadius: 2, border: "1px solid #333" }}>
              <Tooltip title="Select Mode">
                <IconButton
                  size="small"
                  onClick={() => setActiveTool("select")}
                  sx={{ color: activeTool === "select" ? "#c084fc" : "#888", bgcolor: activeTool === "select" ? "rgba(192, 132, 252, 0.15)" : "transparent" }}
                >
                  <PanToolOutlined fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Rectangle Shape">
                <IconButton
                  size="small"
                  onClick={() => setActiveTool("rect")}
                  sx={{ color: activeTool === "rect" ? "#c084fc" : "#888", bgcolor: activeTool === "rect" ? "rgba(192, 132, 252, 0.15)" : "transparent" }}
                >
                  <CropSquareOutlined fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Circle Shape">
                <IconButton
                  size="small"
                  onClick={() => setActiveTool("circle")}
                  sx={{ color: activeTool === "circle" ? "#c084fc" : "#888", bgcolor: activeTool === "circle" ? "rgba(192, 132, 252, 0.15)" : "transparent" }}
                >
                  <RadioButtonUncheckedOutlined fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Sticky Note">
                <IconButton
                  size="small"
                  onClick={() => setActiveTool("note")}
                  sx={{ color: activeTool === "note" ? "#c084fc" : "#888", bgcolor: activeTool === "note" ? "rgba(192, 132, 252, 0.15)" : "transparent" }}
                >
                  <StickyNote2Outlined fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Text Node">
                <IconButton
                  size="small"
                  onClick={() => setActiveTool("text")}
                  sx={{ color: activeTool === "text" ? "#c084fc" : "#888", bgcolor: activeTool === "text" ? "rgba(192, 132, 252, 0.15)" : "transparent" }}
                >
                  <TextFieldsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Clear Canvas">
                <IconButton size="small" onClick={clearCanvas} sx={{ color: "#EF4444" }}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {/* Canvas Interactive Surface */}
          <Box
            onClick={handleCanvasClick}
            sx={{
              position: "relative",
              height: 440,
              bgcolor: "#0F0F0F",
              backgroundImage: "radial-gradient(#262626 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              cursor: activeTool === "select" ? "default" : "crosshair",
              userSelect: "none",
              overflow: "hidden",
            }}
          >
            {/* Live Simulated Cursors */}
            <Box
              sx={{
                position: "absolute",
                top: 90,
                right: 120,
                display: "flex",
                alignItems: "center",
                gap: 0.8,
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <Box sx={{ width: 10, height: 10, bgcolor: "#10B981", borderRadius: "50%" }} />
              <Chip label="Alex (Editing Auth API)" size="small" sx={{ bgcolor: "#10B981", color: "#000", fontWeight: 700, height: 22 }} />
            </Box>

            <Box
              sx={{
                position: "absolute",
                bottom: 80,
                left: 200,
                display: "flex",
                alignItems: "center",
                gap: 0.8,
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <Box sx={{ width: 10, height: 10, bgcolor: "#c084fc", borderRadius: "50%" }} />
              <Chip label="Sarah (Connected)" size="small" sx={{ bgcolor: "#c084fc", color: "#000", fontWeight: 700, height: 22 }} />
            </Box>

            {/* Render Canvas Elements */}
            {shapes.map((s) => (
              <Box
                key={s.id}
                sx={{
                  position: "absolute",
                  left: s.x,
                  top: s.y,
                  bgcolor: s.type === "note" ? "#FEE2E2" : "#1A1A1A",
                  color: s.type === "note" ? "#991B1B" : "#ECECEC",
                  border: `2px solid ${s.color}`,
                  borderRadius: s.type === "circle" ? "50%" : 2,
                  px: s.type === "circle" ? 3 : 2.5,
                  py: s.type === "circle" ? 3 : 1.5,
                  boxShadow: `0 8px 20px ${s.color}25`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  transition: "all 0.2s ease-in-out",
                  "&:hover": { transform: "scale(1.04)" },
                }}
              >
                {s.label}
              </Box>
            ))}

            {shapes.length === 0 && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#666",
                }}
              >
                <BrushOutlined sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography variant="body1">Canvas is empty. Click anywhere to spawn elements!</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </Container>

      {/* Feature Highlights Grid */}
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

      {/* Workspaces Section */}
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

      {/* Pricing Section */}
      <Container maxWidth="lg" id="pricing" sx={{ pb: 12 }}>
        <Box sx={{ textAlign: "center", mb: 8 }}>
          <Typography variant="caption" sx={{ color: "#c084fc", fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
            SIMPLE PRICING
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, color: "#FFFFFF" }}>
            Choose the Plan That Fits Your Team
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
            gap: 4,
            maxWidth: 900,
            mx: "auto",
          }}
        >
          <PricingCard
            title="Free Starter"
            price="$0"
            subtitle="Perfect for individual creators and quick diagramming"
            features={[
              "Up to 3 active Workspaces",
              "Unlimited Excalidraw Canvases",
              "SVG & PNG Export",
              "Community Support",
            ]}
            buttonText="Get Started Free"
            onAction={() => openAuth("signup")}
          />

          <PricingCard
            title="Pro Team"
            price="$12"
            period="/ user / month"
            popular={true}
            subtitle="For engineering & design teams requiring full collaboration"
            features={[
              "Unlimited Workspaces & Canvases",
              "Real-time Multiplayer Collaboration",
              "Advanced Permissions & Admin Controls",
              "Priority 24/7 Support",
              "Custom Branding & Domain Integration",
            ]}
            buttonText="Start 14-Day Free Trial"
            onAction={() => openAuth("signup")}
          />
        </Box>
      </Container>

      {/* Bottom CTA Banner */}
      <Container maxWidth="lg" sx={{ pb: 10 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 5, md: 8 },
            textAlign: "center",
            bgcolor: "#1E1E24",
            border: "1px solid #33333F",
            borderRadius: 4,
            position: "relative",
            overflow: "hidden",
            "&::before": {
              content: '""',
              position: "absolute",
              top: "-50%",
              left: "50%",
              transform: "translateX(-50%)",
              width: "600px",
              height: "400px",
              background: "radial-gradient(circle, rgba(192, 132, 252, 0.2) 0%, rgba(0, 0, 0, 0) 70%)",
              pointerEvents: "none",
            },
          }}
        >
          <Typography variant="h3" sx={{ fontWeight: 800, color: "#FFFFFF", mb: 2 }}>
            Ready to Build Your Next Big Idea?
          </Typography>
          <Typography variant="body1" sx={{ color: "#A6A6A6", maxWidth: 600, mx: "auto", mb: 4, fontSize: "1.1rem" }}>
            Join thousands of developers and designers already using Blueprint to map out their software architecture.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => openAuth("signup")}
            endIcon={<ArrowForward />}
            sx={{
              bgcolor: "#ECECEC",
              color: "#111",
              fontWeight: 700,
              fontSize: "1.05rem",
              px: 4,
              py: 1.6,
              borderRadius: 2.5,
              textTransform: "none",
              boxShadow: "0 8px 24px rgba(255, 255, 255, 0.2)",
              "&:hover": { bgcolor: "#FFFFFF" },
            }}
          >
            Create Your Free Account
          </Button>
        </Paper>
      </Container>

      {/* Footer */}
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
    </Box>
  );
}

// Subcomponents
function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
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

function PricingCard({
  title,
  price,
  period,
  subtitle,
  features,
  buttonText,
  popular = false,
  onAction,
}: {
  title: string;
  price: string;
  period?: string;
  subtitle: string;
  features: string[];
  buttonText: string;
  popular?: boolean;
  onAction: () => void;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: popular ? "#1E1C24" : "#1A1A1A",
        border: popular ? "2px solid #c084fc" : "1px solid #2B2B2B",
        borderRadius: 3.5,
        position: "relative",
      }}
    >
      {popular && (
        <Chip
          label="MOST POPULAR"
          size="small"
          sx={{
            position: "absolute",
            top: -14,
            right: 24,
            bgcolor: "#c084fc",
            color: "#111",
            fontWeight: 800,
            fontSize: "0.75rem",
          }}
        />
      )}

      <Typography variant="h5" sx={{ fontWeight: 800, color: "#FFFFFF", mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "#A6A6A6", mb: 3 }}>
        {subtitle}
      </Typography>

      <Box sx={{ display: "flex", alignItems: "baseline", mb: 3 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: "#FFFFFF" }}>
          {price}
        </Typography>
        {period && (
          <Typography variant="body2" sx={{ color: "#A6A6A6", ml: 1 }}>
            {period}
          </Typography>
        )}
      </Box>

      <Stack spacing={1.5} sx={{ mb: 4, flexGrow: 1 }}>
        {features.map((f, i) => (
          <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CheckCircleRounded sx={{ color: popular ? "#c084fc" : "#10B981", fontSize: 18 }} />
            <Typography variant="body2" sx={{ color: "#ECECEC", fontSize: "0.9rem" }}>
              {f}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Button
        variant={popular ? "contained" : "outlined"}
        onClick={onAction}
        fullWidth
        sx={{
          py: 1.3,
          bgcolor: popular ? "#c084fc" : "transparent",
          color: popular ? "#111" : "#ECECEC",
          borderColor: "#3F3F3F",
          fontWeight: 700,
          borderRadius: 2,
          textTransform: "none",
          "&:hover": {
            bgcolor: popular ? "#d8b4fe" : "rgba(255, 255, 255, 0.08)",
          },
        }}
      >
        {buttonText}
      </Button>
    </Paper>
  );
}

const navLinkStyle = {
  color: "#A6A6A6",
  textDecoration: "none",
  fontWeight: 500,
  fontSize: "0.95rem",
  transition: "color 0.2s",
  "&:hover": { color: "#ECECEC" },
};

const footerLinkStyle = {
  color: "#888888",
  textDecoration: "none",
  fontSize: "0.85rem",
  "&:hover": { color: "#ECECEC" },
};