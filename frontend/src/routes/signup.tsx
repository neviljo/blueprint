import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import AuthForm from "../components/AuthForm";
import AuthPageLayout from "../components/AuthPageLayout";
import { getCurrentSession } from "../lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();

  useEffect(() => {
    getCurrentSession().then((session) => {
      if (session?.user) {
        navigate({ to: "/dashboard" });
      }
    });
  }, [navigate]);

  return (
    <AuthPageLayout>
      <AuthForm initialMode="signup" />
    </AuthPageLayout>
  );
}
