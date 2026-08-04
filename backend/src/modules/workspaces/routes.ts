import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { requireAuth } from "../auth/middleware.js";
import { createWorkspaceSchema, updateWorkspaceSchema } from "./validators.js";
import { createWorkspace,  getWorkspaces, getWorkspaceById, updateWorkspace, deleteWorkspace} from "./service.js";

const router = new Hono();

router.post(
  "/",
  requireAuth,
  zValidator("json", createWorkspaceSchema),
  async (c) => {
    const { name } = c.req.valid("json");

    const user = c.get("user");

    const workspace = await createWorkspace(
      name,
      user.id
    );

    return c.json(workspace, 201);
  }
);

router.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const workspaces = await getWorkspaces(user.id);

  return c.json(workspaces);
});

router.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;

  const workspace = await getWorkspaceById(
    id,
    user.id
  );

  if (!workspace) {
    return c.json(
      {
        message: "Workspace not found",
      },
      404
    );
  }

  return c.json(workspace);
});

router.patch(
  "/:id",
  requireAuth,
  zValidator("json", updateWorkspaceSchema),
  async (c) => {
    const user = c.get("user");

    const id = c.req.param("id")!;

    const { name } = c.req.valid("json");

    const workspace = await updateWorkspace(
      id,
      user.id,
      name
    );

    return c.json(workspace);
  }
);

router.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");

  const id = c.req.param("id")!;

  const workspace = await deleteWorkspace(id, user.id);

  if (!workspace) {
    return c.json(
      {
        message: "Workspace not found",
      },
      404
    );
  }

  return c.json(workspace);
});


export default router;