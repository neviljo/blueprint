

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Box, Toolbar } from "@mui/material";

import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import { requireAuth } from "../../lib/auth";

const drawerWidth = 240;

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <Box sx={{ display: "flex", width: "100%" }}>
      <Sidebar />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: {
            md: `calc(100% - ${drawerWidth}px)`,
          },
        }}
      >
        <TopBar />

        <Toolbar />

        <Box sx={{ p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}