import {
  Card,
  CardActionArea,
  Box,
  Typography,
  Chip,
} from "@mui/material";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { Link } from "@tanstack/react-router";
import TileActions from "./TileActions";

interface WorkspaceTileProps {
  id: string;
  name: string;
  canvases: number;
  onDelete?: (id: string) => void;
}

export default function WorkspaceTile({
  id,
  name,
  canvases,
  onDelete,
}: WorkspaceTileProps) {
  return (
    <>
      <Box sx={{ position: "relative", width: 280 }}>
        <Link
          to="/dashboard/workspaces/$workspaceId"
          params={{ workspaceId: id }}
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Card
            elevation={0}
            sx={{
              width: "100%",
              borderRadius: 3,
              bgcolor: "#000",
              border: "1px solid #242424",
              transition: "all .18s ease",
              "&:hover": {
                borderColor: "#3c3c3c",
                transform: "translateY(-2px)",
                cursor: "pointer",
              },
            }}
          >
            <CardActionArea component="div" sx={{ p: 2.5 }}>
              {/* Top Row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2,
                    bgcolor: "#111",
                    border: "1px solid #222",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FolderRoundedIcon sx={{ color: "#3ECF8E" }} />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={`${canvases}`}
                    size="small"
                    sx={{
                      bgcolor: "#151515",
                      color: "#999",
                      border: "1px solid #252525",
                    }}
                  />

                  <TileActions
                    name={name}
                    resourceType="workspace"
                    onDelete={() => onDelete?.(id)}
                    iconSx={{
                      color: "#777",
                      "&:hover": { color: "#ECECEC", bgcolor: "#222" },
                    }}
                  />
                </Box>
              </Box>

              {/* Title */}
              <Typography sx={{ fontWeight: 600, fontSize: 17 }}>
                {name}
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>
                {canvases} canvases
              </Typography>

              {/* Bottom */}
              <Box
                sx={{
                  mt: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "#3ECF8E",
                  }}
                />

                <Typography variant="caption" color="text.secondary">
                  Active
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        </Link>
      </Box>
    </>
  );
}