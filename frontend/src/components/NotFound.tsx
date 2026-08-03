import { Box, Typography, Button } from "@mui/material";
import { Link } from "@tanstack/react-router";

export default function NotFound() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Typography variant="h2" sx={{ fontWeight: "bold" }}>
        404
      </Typography>

      <Typography variant="h6" color="text.secondary">
        Page not found
      </Typography>

      <Button
        component={Link}
        to="/"
        variant="contained"
        color="primary"
      >
        Go Home
      </Button>
    </Box>
  );
}