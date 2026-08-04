import { createFileRoute } from "@tanstack/react-router";

import DashboardLayout from "../../components/layouts/DashboardLayout";
import { requireAuth } from "../../lib/auth";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  component: DashboardLayout,
});
