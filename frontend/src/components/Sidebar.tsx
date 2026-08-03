
// import { useState } from "react";
// import WorkspaceDashboard from "./WorkspaceDashboard";
// import WorkspaceView from "./WorkspaceView";

// import {
//   AppBar,
//   Box,
//   CssBaseline,
//   Divider,
//   Drawer,
//   IconButton,
//   List,
//   ListItem,
//   ListItemButton,
//   ListItemIcon,
//   ListItemText,
//   Toolbar,
//   Typography,
//   useMediaQuery,
//   useTheme,
// } from "@mui/material";

// import {
//   Dashboard,
//   Analytics,
//   People,
//   Settings,
//   Menu,
// } from "@mui/icons-material";

// const drawerWidth = 240;

// const menuItems = [
//   {
//     text: "Dashboard",
//     icon: <Dashboard />,
//   },
//   {
//     text: "Analytics",
//     icon: <Analytics />,
//   },
//   {
//     text: "Users",
//     icon: <People />,
//   },
//   {
//     text: "Settings",
//     icon: <Settings />,
//   },
// ];

// export default function Sidebar() {
//   const theme = useTheme();
//   const isMobile = useMediaQuery(theme.breakpoints.down("md"));

//   const [mobileOpen, setMobileOpen] = useState(false);

//   const drawer = (
//     <>
//       <Toolbar>
//         <Typography fontWeight={700}>
//           Blueprint
//         </Typography>
//       </Toolbar>

//       <Divider />

//       <List>
//         {menuItems.map((item) => (
//           <ListItem
//             key={item.text}
//             disablePadding
//           >
//             <ListItemButton>
//               <ListItemIcon>{item.icon}</ListItemIcon>

//               <ListItemText primary={item.text} />
//             </ListItemButton>
//           </ListItem>
//         ))}
//       </List>
//     </>
//   );

//   return (
//     <Box sx={{ display: "flex", width: "100%" }}>
//       <CssBaseline />

//       {/* TOP BAR */}

//       <AppBar
//         position="fixed"
//         elevation={0}
//         sx={{
//           bgcolor: "#000",
//           borderBottom: "1px solid #1f1f1f",
//           width: {
//             md: `calc(100% - ${drawerWidth}px)`,
//           },
//           ml: {
//             md: `${drawerWidth}px`,
//           },
//         }}
//       >
//         <Toolbar>
//           {isMobile && (
//             <IconButton
//               color="inherit"
//               edge="start"
//               onClick={() => setMobileOpen(true)}
//               sx={{ mr: 2 }}
//             >
//               <Menu />
//             </IconButton>
//           )}

//           <Typography
//             variant="h6"
//             fontWeight={700}
//           >
//             Blueprint
//           </Typography>
//         </Toolbar>
//       </AppBar>

//       {/* SIDEBAR */}

//       <Box
//         component="nav"
//         sx={{
//           width: {
//             md: drawerWidth,
//           },
//           flexShrink: {
//             md: 0,
//           },
//         }}
//       >
//         {/* Mobile */}

//         <Drawer
//           variant="temporary"
//           open={mobileOpen}
//           onClose={() => setMobileOpen(false)}
//           ModalProps={{
//             keepMounted: true,
//           }}
//           sx={{
//             display: {
//               xs: "block",
//               md: "none",
//             },
//             "& .MuiDrawer-paper": {
//               width: drawerWidth,
//             },
//           }}
//         >
//           {drawer}
//         </Drawer>

//         {/* Desktop */}

//         <Drawer
//           variant="permanent"
//           sx={{
//             display: {
//               xs: "none",
//               md: "block",
//             },

//             "& .MuiDrawer-paper": {
//               width: drawerWidth,
//               boxSizing: "border-box",
//               borderRight: "1px solid #1f1f1f",
//               bgcolor: "#000",
//             },
//           }}
//           open
//         >
//           {drawer}
//         </Drawer>
//       </Box>

//       {/* PAGE */}

//       <Box
//         component="main"
//         sx={{
//           flexGrow: 1,
//           width: {
//             md: `calc(100% - ${drawerWidth}px)`,
//           },
//           p: 3,
//         }}
//       >
//         <Toolbar />

//         {/* <WorkspaceDashboard /> */}
//         <WorkspaceView workspaceName="hekk"/>
//       </Box>
//     </Box>
//   );
// }

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

const drawerWidth = 240;

const menuItems = [
  {
    text: "Dashboard",
    icon: <Dashboard />,
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
            <ListItemButton>
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