import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { requireAuth } from "../auth/middleware.js";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addMemberSchema,
} from "./validators.js";
import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceMembers,
  addWorkspaceMember,
  removeWorkspaceMember,
} from "./service.js";

const router = new Hono();

router.post(
  "/",
  requireAuth,
  zValidator("json", createWorkspaceSchema),
  async (c) => {
    const { name } = c.req.valid("json");

    const user = c.get("user");

    const workspace = await createWorkspace(name, user.id);

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

  const workspace = await getWorkspaceById(id, user.id);

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

router.get("/:id/members", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;

  const members = await getWorkspaceMembers(id, user.id);

  return c.json(members);
});

router.post(
  "/:id/members",
  requireAuth,
  zValidator("json", addMemberSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const { email } = c.req.valid("json");

    const member = await addWorkspaceMember(id, user.id, email);

    return c.json(member, 201);
  }
);

router.delete("/:id/members/:userId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;
  const userId = c.req.param("userId")!;

  const member = await removeWorkspaceMember(id, user.id, userId);

  if (!member) {
    return c.json(
      {
        message: "Member not found",
      },
      404
    );
  }

  return c.json(member);
});

router.patch(
  "/:id",
  requireAuth,
  zValidator("json", updateWorkspaceSchema),
  async (c) => {
    const user = c.get("user");

    const id = c.req.param("id")!;

    const { name } = c.req.valid("json");

    const workspace = await updateWorkspace(id, user.id, name);

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