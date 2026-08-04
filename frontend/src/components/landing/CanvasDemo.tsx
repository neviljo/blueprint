import { useState } from "react";
import {
  Box,
  Container,
  Paper,
  Typography,
  Stack,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  BrushOutlined,
  CropSquareOutlined,
  RadioButtonUncheckedOutlined,
  StickyNote2Outlined,
  TextFieldsOutlined,
  PanToolOutlined,
  DeleteOutlineRounded,
} from "@mui/icons-material";

type CanvasTool = "select" | "rect" | "circle" | "text" | "note";

interface CanvasShape {
  id: number;
  type: CanvasTool;
  x: number;
  y: number;
  label: string;
  color: string;
}

const TOOL_LABELS: Record<Exclude<CanvasTool, "select">, string> = {
  rect: "Microservice Node",
  circle: "Cache / Storage",
  text: "Component State",
  note: "✏️ Live note element",
};

const SHAPE_COLORS = ["#8B5CF6", "#EC4899", "#3B82F6", "#10B981", "#F59E0B"];

export default function CanvasDemo() {
  const [activeTool, setActiveTool] = useState<CanvasTool>("rect");
  const [shapes, setShapes] = useState<CanvasShape[]>([
    { id: 1, type: "rect", x: 50, y: 40, label: "Auth Service API", color: "#3B82F6" },
    { id: 2, type: "circle", x: 270, y: 40, label: "PostgreSQL DB", color: "#10B981" },
    { id: 3, type: "note", x: 160, y: 150, label: "💡 Use Redis for caching", color: "#F59E0B" },
    { id: 4, type: "text", x: 60, y: 240, label: "// Blueprint Whiteboard Canvas", color: "#EC4899" },
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === "select") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(20, Math.min(rect.width - 180, e.clientX - rect.left - 50));
    const y = Math.max(20, Math.min(rect.height - 80, e.clientY - rect.top - 20));

    const newShape: CanvasShape = {
      id: Date.now(),
      type: activeTool,
      x,
      y,
      label: TOOL_LABELS[activeTool],
      color: SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)],
    };

    setShapes((prev) => [...prev, newShape]);
  };

  const clearCanvas = () => {
    setShapes([]);
  };

  return (
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
  );
}
