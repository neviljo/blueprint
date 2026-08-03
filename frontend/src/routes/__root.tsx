import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import { darkTheme } from "../theme/theme";
import NotFound from "../components/NotFound"; // your 404 component

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Outlet />
    </ThemeProvider>
  );
}