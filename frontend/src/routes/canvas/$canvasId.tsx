import { createFileRoute } from "@tanstack/react-router";
import CanvasWorkspace from "../../components/CanvasWorkspace";
import { requireAuth } from "../../lib/auth";

export const Route = createFileRoute("/canvas/$canvasId")({
  beforeLoad: requireAuth,
  component: CanvasPage,
});

function CanvasPage() {
  const { canvasId } = Route.useParams();

  return <CanvasWorkspace canvasId={canvasId} />;
}
