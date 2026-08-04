import { Box, Container, Typography, Paper, Stack, Chip, Button } from "@mui/material";
import { CheckCircleRounded } from "@mui/icons-material";

export interface PricingSectionProps {
  onOpenAuth: (mode: "signin" | "signup") => void;
}

function PricingCard({
  title,
  price,
  period,
  subtitle,
  features,
  buttonText,
  popular = false,
  onAction,
}: {
  title: string;
  price: string;
  period?: string;
  subtitle: string;
  features: string[];
  buttonText: string;
  popular?: boolean;
  onAction: () => void;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: popular ? "#1E1C24" : "#1A1A1A",
        border: popular ? "2px solid #c084fc" : "1px solid #2B2B2B",
        borderRadius: 3.5,
        position: "relative",
      }}
    >
      {popular && (
        <Chip
          label="MOST POPULAR"
          size="small"
          sx={{
            position: "absolute",
            top: -14,
            right: 24,
            bgcolor: "#c084fc",
            color: "#111",
            fontWeight: 800,
            fontSize: "0.75rem",
          }}
        />
      )}

      <Typography variant="h5" sx={{ fontWeight: 800, color: "#FFFFFF", mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "#A6A6A6", mb: 3 }}>
        {subtitle}
      </Typography>

      <Box sx={{ display: "flex", alignItems: "baseline", mb: 3 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: "#FFFFFF" }}>
          {price}
        </Typography>
        {period && (
          <Typography variant="body2" sx={{ color: "#A6A6A6", ml: 1 }}>
            {period}
          </Typography>
        )}
      </Box>

      <Stack spacing={1.5} sx={{ mb: 4, flexGrow: 1 }}>
        {features.map((f, i) => (
          <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CheckCircleRounded sx={{ color: popular ? "#c084fc" : "#10B981", fontSize: 18 }} />
            <Typography variant="body2" sx={{ color: "#ECECEC", fontSize: "0.9rem" }}>
              {f}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Button
        variant={popular ? "contained" : "outlined"}
        onClick={onAction}
        fullWidth
        sx={{
          py: 1.3,
          bgcolor: popular ? "#c084fc" : "transparent",
          color: popular ? "#111" : "#ECECEC",
          borderColor: "#3F3F3F",
          fontWeight: 700,
          borderRadius: 2,
          textTransform: "none",
          "&:hover": {
            bgcolor: popular ? "#d8b4fe" : "rgba(255, 255, 255, 0.08)",
          },
        }}
      >
        {buttonText}
      </Button>
    </Paper>
  );
}

export default function PricingSection({ onOpenAuth }: PricingSectionProps) {
  return (
    <Container maxWidth="lg" id="pricing" sx={{ pb: 12 }}>
      <Box sx={{ textAlign: "center", mb: 8 }}>
        <Typography variant="caption" sx={{ color: "#c084fc", fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
          SIMPLE PRICING
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, color: "#FFFFFF" }}>
          Choose the Plan That Fits Your Team
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
          gap: 4,
          maxWidth: 900,
          mx: "auto",
        }}
      >
        <PricingCard
          title="Free Starter"
          price="$0"
          subtitle="Perfect for individual creators and quick diagramming"
          features={[
            "Up to 3 active Workspaces",
            "Unlimited Excalidraw Canvases",
            "SVG & PNG Export",
            "Community Support",
          ]}
          buttonText="Get Started Free"
          onAction={() => onOpenAuth("signup")}
        />

        <PricingCard
          title="Pro Team"
          price="$12"
          period="/ user / month"
          popular={true}
          subtitle="For engineering & design teams requiring full collaboration"
          features={[
            "Unlimited Workspaces & Canvases",
            "Real-time Multiplayer Collaboration",
            "Advanced Permissions & Admin Controls",
            "Priority 24/7 Support",
            "Custom Branding & Domain Integration",
          ]}
          buttonText="Start 14-Day Free Trial"
          onAction={() => onOpenAuth("signup")}
        />
      </Box>
    </Container>
  );
}
