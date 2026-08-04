import { Outlet } from "@tanstack/react-router";
import { Box, Toolbar } from "@mui/material";

import Sidebar from "../Sidebar";
import TopBar from "../TopBar";

const drawerWidth = 240;

export default function DashboardLayout() {
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

        <Box
          sx={{
            p: 3,
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}