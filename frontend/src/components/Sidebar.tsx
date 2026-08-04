import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import {
  Dashboard,
  Analytics,
  People,
  Settings,
  Menu,
} from "@mui/icons-material";

import { useState } from "react";
import { Link } from "@tanstack/react-router";

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  to?: "/dashboard";
}

const menuItems: MenuItem[] = [
  {
    text: "Dashboard",
    icon: <Dashboard />,
    to: "/dashboard",
  },
  {
    text: "Analytics",
    icon: <Analytics />,
  },
  {
    text: "Users",
    icon: <People />,
  },
  {
    text: "Settings",
    icon: <Settings />,
  },
];

export default function Sidebar() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [mobileOpen, setMobileOpen] = useState(false);

  const drawer = (
    <>
      <Toolbar>
        <Typography sx={{ fontWeight: 700 }}>
          Blueprint
        </Typography>
      </Toolbar>

      <Divider />

      <List>
        {menuItems.map((item) => (
          <ListItem
            key={item.text}
            disablePadding
          >
            <ListItemButton
              component={item.to ? Link : "button"}
              {...(item.to ? { to: item.to } : {})}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>

              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </>
  );

  return (
    <Box
      component="nav"
      sx={{
        width: {
          md: drawerWidth,
        },
        flexShrink: {
          md: 0,
        },
      }}
    >
      {/* Mobile */}

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{
          keepMounted: true,
        }}
        sx={{
          display: {
            xs: "block",
            md: "none",
          },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            bgcolor: "#000",
            borderRight: "1px solid #1f1f1f",
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Desktop */}

      <Drawer
        variant="permanent"
        open
        sx={{
          display: {
            xs: "none",
            md: "block",
          },

          "& .MuiDrawer-paper": {
            width: drawerWidth,
            bgcolor: "#000",
            borderRight: "1px solid #1f1f1f",
            boxSizing: "border-box",
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Floating Mobile Menu Button */}

      {isMobile && (
        <IconButton
          onClick={() => setMobileOpen(true)}
          sx={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 2000,
            color: "white",
          }}
        >
          <Menu />
        </IconButton>
      )}
    </Box>
  );
}
