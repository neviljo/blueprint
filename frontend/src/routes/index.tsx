import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Box } from "@mui/material";
import AuthModal from "../components/AuthModal";
import LandingHeader from "../components/landing/LandingHeader";
import HeroSection from "../components/landing/HeroSection";
import CanvasDemo from "../components/landing/CanvasDemo";
import FeatureGrid from "../components/landing/FeatureGrid";
import WorkspacesSection from "../components/landing/WorkspacesSection";
import PricingSection from "../components/landing/PricingSection";
import CTABanner from "../components/landing/CTABanner";
import LandingFooter from "../components/landing/LandingFooter";
import { getCurrentSession } from "../lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getCurrentSession();
    if (session?.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  return (
    <Box sx={{ bgcolor: "#000", color: "#ECECEC", minHeight: "100vh", overflowX: "hidden" }}>
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
      />

      <LandingHeader onOpenAuth={openAuth} />
      <HeroSection onOpenAuth={openAuth} />
      <CanvasDemo />
      <FeatureGrid />
      <WorkspacesSection />
      <PricingSection onOpenAuth={openAuth} />
      <CTABanner onOpenAuth={openAuth} />
      <LandingFooter />
    </Box>
  );
}
