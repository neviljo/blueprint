import { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from "@mui/material";
import {
  Logout,
  Person,
  Home,
  Settings,
} from "@mui/icons-material";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import AuthModal from "./AuthModal";
import { authApi } from "../lib/api";
import { clearSessionCache, getCurrentSession } from "../lib/auth";

const drawerWidth = 240;

export default function TopBar() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    getCurrentSession().then((session) => {
      if (session?.user) {
        setIsSignedIn(true);
        setUserEmail(session.user.email);
      }
    });
  }, []);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.signOut();
      clearSessionCache();
    } finally {
      setIsSignedIn(false);
      setUserEmail(null);
      handleMenuClose();
      navigate({ to: "/" });
    }
  };

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: "#000",
          borderBottom: "1px solid #1f1f1f",
          width: {
            md: `calc(100% - ${drawerWidth}px)`,
          },
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "#ECECEC" }}>
            Blueprint
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button
              component={RouterLink}
              to="/"
              startIcon={<Home />}
              size="small"
              sx={{
                color: "#A6A6A6",
                textTransform: "none",
                "&:hover": { color: "#ECECEC" },
              }}
            >
              Landing Page
            </Button>

            {isSignedIn ? (
              <>
                <IconButton onClick={handleMenuOpen} size="small" sx={{ ml: 1 }}>
                  <Avatar
                    alt={userEmail || "User"}
                    src="https://i.pravatar.cc/100?img=33"
                    sx={{ width: 32, height: 32, border: "1px solid #3F3F3F" }}
                  />
                </IconButton>

                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                  slotProps={{
                    paper: {
                      sx: {
                        bgcolor: "#1A1A1A",
                        border: "1px solid #2F2F2F",
                        color: "#ECECEC",
                        mt: 1,
                        minWidth: 180,
                      },
                    },
                  }}
                >
                  <MenuItem onClick={handleMenuClose}>
                    <ListItemIcon>
                      <Person fontSize="small" sx={{ color: "#A6A6A6" }} />
                    </ListItemIcon>
                    Profile
                  </MenuItem>
                  <MenuItem onClick={handleMenuClose}>
                    <ListItemIcon>
                      <Settings fontSize="small" sx={{ color: "#A6A6A6" }} />
                    </ListItemIcon>
                    Settings
                  </MenuItem>
                  <Divider sx={{ borderColor: "#2F2F2F" }} />
                  <MenuItem onClick={handleLogout} sx={{ color: "#EF4444" }}>
                    <ListItemIcon>
                      <Logout fontSize="small" sx={{ color: "#EF4444" }} />
                    </ListItemIcon>
                    Sign Out
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={() => setAuthOpen(true)}
                sx={{
                  bgcolor: "#ECECEC",
                  color: "#111",
                  fontWeight: 700,
                  textTransform: "none",
                  "&:hover": { bgcolor: "#FFFFFF" },
                }}
              >
                Sign In
              </Button>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          getCurrentSession(true).then((session) => {
            setIsSignedIn(Boolean(session?.user));
            setUserEmail(session?.user?.email ?? null);
          });
        }}
      />
    </>
  );
}