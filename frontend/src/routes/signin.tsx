import { useEffect } from "react";
import { createFileRoute, Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Box, Button } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AuthForm from "../components/AuthForm";
import { getCurrentSession } from "../lib/auth";

export const Route = createFileRoute("/signin")({
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();

  useEffect(() => {
    getCurrentSession().then((session) => {
      if (session?.user) {
        navigate({ to: "/dashboard" });
      }
    });
  }, [navigate]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#121212",
        px: 2,
        py: 6,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(192, 132, 252, 0.12) 0%, rgba(0, 0, 0, 0) 70%)",
          pointerEvents: "none",
        },
      }}
    >
      <Button
        component={RouterLink}
        to="/"
        startIcon={<ArrowBackRoundedIcon />}
        sx={{
          position: "absolute",
          top: 24,
          left: 24,
          color: "#A6A6A6",
          textTransform: "none",
          "&:hover": {
            color: "#ECECEC",
            bgcolor: "rgba(255, 255, 255, 0.05)",
          },
        }}
      >
        Back to Home
      </Button>

      <AuthForm initialMode="signin" />
    </Box>
  );
}
