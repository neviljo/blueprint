
import { createFileRoute } from "@tanstack/react-router";
import WorkspaceDashboard from "../../components/WorkspaceDashboard";

export const Route = createFileRoute("/dashboard/")({
  component: WorkspaceDashboard,
});