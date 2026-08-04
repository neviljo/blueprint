import {
  Card,
  CardActionArea,
  Box,
  Typography,
  Chip,
} from "@mui/material";
import { Link } from "@tanstack/react-router";
import TileActions from "./TileActions";

interface Props {
  id: string;
  name: string;
  objects: number;
  onDelete?: (id: string) => void;
}

export default function CanvasTile({
  id,
  name,
  objects,
  onDelete,
}: Props) {
  return (
    <>
      <Box sx={{ position: "relative", width: 300 }}>
        <Link
          to="/canvas/$canvasId"
          params={{ canvasId: id }}
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Card
            elevation={0}
            sx={{
              width: "100%",
              position: "relative",
              borderRadius: 3,
              bgcolor: "#0a0a0a",
              border: "1px solid #242424",
              overflow: "hidden",
              transition: ".18s",
              "&:hover": {
                transform: "translateY(-2px)",
                borderColor: "#3ECF8E",
              },
            }}
          >
            <CardActionArea>
              {/* Preview Header */}
              <Box
                sx={{
                  height: 170,
                  bgcolor: "#111",
                  borderBottom: "1px solid #242424",
                  position: "relative",
                }}
              >
                {/* Fake Excalidraw Preview */}
                <Box
                  sx={{
                    position: "absolute",
                    top: 35,
                    left: 35,
                    width: 120,
                    height: 2,
                    bgcolor: "#666",
                    transform: "rotate(15deg)",
                  }}
                />

                <Box
                  sx={{
                    position: "absolute",
                    top: 80,
                    left: 110,
                    width: 90,
                    height: 2,
                    bgcolor: "#555",
                    transform: "rotate(-20deg)",
                  }}
                />

                <Box
                  sx={{
                    position: "absolute",
                    top: 55,
                    left: 190,
                    width: 26,
                    height: 26,
                    border: "2px solid #777",
                    borderRadius: 1,
                  }}
                />

                <Box
                  sx={{
                    position: "absolute",
                    top: 120,
                    left: 60,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "2px solid #777",
                  }}
                />
              </Box>

              {/* Footer */}
              <Box sx={{ p: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {name}
                </Typography>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mt: 1.5,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Edited just now
                  </Typography>

                  <Chip
                    size="small"
                    label={`${objects} objects`}
                    sx={{
                      bgcolor: "#151515",
                      color: "#999",
                      border: "1px solid #252525",
                    }}
                  />
                </Box>
              </Box>
            </CardActionArea>

            {/* Delete Menu Trigger Button */}
            <TileActions
              name={name}
              resourceType="canvas"
              onDelete={() => onDelete?.(id)}
              iconSx={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 10,
                color: "#777",
                bgcolor: "rgba(0,0,0,0.5)",
                "&:hover": { color: "#ECECEC", bgcolor: "rgba(0,0,0,0.8)" },
              }}
            />
          </Card>
        </Link>
      </Box>
    </>
  );
}