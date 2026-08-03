import { createTheme } from "@mui/material/styles";

export const darkTheme = createTheme({
  palette: {
    mode: "dark",

    background: {
      default: "#212121",
      paper: "#2F2F2F",
    },

    text: {
      primary: "#ECECEC",
      secondary: "#A6A6A6",
    },

    divider: "#3F3F3F",
  },

  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#2F2F2F",
          border: "1px solid #3F3F3F",
          boxShadow: "none",
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#2F2F2F",
          borderBottom: "1px solid #3F3F3F",
          boxShadow: "none",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#171717",
          borderRight: "1px solid #3F3F3F",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: "#2F2F2F",
          border: "1px solid #3F3F3F",
          boxShadow: "none",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        contained: {
          backgroundColor: "#ECECEC",
          color: "#111",

          "&:hover": {
            backgroundColor: "#FFFFFF",
          },
        },
      },
    },
  },
});