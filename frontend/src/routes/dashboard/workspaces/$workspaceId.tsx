import { createFileRoute } from "@tanstack/react-router";
import WorkspaceView from "../../../components/WorkspaceView";

export const Route = createFileRoute(
  "/dashboard/workspaces/$workspaceId"
)({
  component: WorkspacePage,
});

function WorkspacePage() {
  const { workspaceId } = Route.useParams();

  return (
    <WorkspaceView workspaceId={workspaceId} />
  );
}