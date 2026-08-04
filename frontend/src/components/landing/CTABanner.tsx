import { Container, Paper, Typography, Button } from "@mui/material";
import { ArrowForward } from "@mui/icons-material";

export interface CTABannerProps {
  onOpenAuth: (mode: "signin" | "signup") => void;
}

export default function CTABanner({ onOpenAuth }: CTABannerProps) {
  return (
    <Container maxWidth="lg" sx={{ pb: 10 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 5, md: 8 },
          textAlign: "center",
          bgcolor: "#1E1E24",
          border: "1px solid #33333F",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: "-50%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "600px",
            height: "400px",
            background: "radial-gradient(circle, rgba(192, 132, 252, 0.2) 0%, rgba(0, 0, 0, 0) 70%)",
            pointerEvents: "none",
          },
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, color: "#FFFFFF", mb: 2 }}>
          Ready to Build Your Next Big Idea?
        </Typography>
        <Typography variant="body1" sx={{ color: "#A6A6A6", maxWidth: 600, mx: "auto", mb: 4, fontSize: "1.1rem" }}>
          Join thousands of developers and designers already using Blueprint to map out their software architecture.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => onOpenAuth("signup")}
          endIcon={<ArrowForward />}
          sx={{
            bgcolor: "#ECECEC",
            color: "#111",
            fontWeight: 700,
            fontSize: "1.05rem",
            px: 4,
            py: 1.6,
            borderRadius: 2.5,
            textTransform: "none",
            boxShadow: "0 8px 24px rgba(255, 255, 255, 0.2)",
            "&:hover": { bgcolor: "#FFFFFF" },
          }}
        >
          Create Your Free Account
        </Button>
      </Paper>
    </Container>
  );
}
