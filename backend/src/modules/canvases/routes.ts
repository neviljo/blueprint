import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { requireAuth } from "../auth/middleware.js";

import { createCanvas,  getCanvasesByWorkspace, getCanvasById, updateCanvas, deleteCanvas, updateCanvasContent} from "./service.js";
import { createCanvasSchema, updateCanvasSchema, updateCanvasContentSchema } from "./validators.js";

const router = new Hono();

router.post(
  "/",
  requireAuth,
  zValidator("json", createCanvasSchema),
  async (c) => {
    const user = c.get("user");

    const { name, workspaceId } = c.req.valid("json");

    const canvas = await createCanvas(
      name,
      workspaceId,
      user.id
    ); 
    return c.json(canvas, 201);
  }
);

router.get(
  "/workspace/:workspaceId",
  requireAuth,
  async (c) => {
    const workspaceId = c.req.param("workspaceId")!;

    const user = c.get("user");
    const canvases = await getCanvasesByWorkspace(
      workspaceId,
      user.id
    );

    return c.json(canvases);
  }
);

router.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");

  const id = c.req.param("id")!;

  const canvas = await getCanvasById(id, user.id);

  if (!canvas) {
    return c.json(
      {
        message: "Canvas not found",
      },
      404
    );
  }

  return c.json(canvas);
});

router.patch(
  "/:id",
  requireAuth,
  zValidator("json", updateCanvasSchema),
  async (c) => {
    const user = c.get("user");

    const id = c.req.param("id")!;

    const { name } = c.req.valid("json");

    const canvas = await updateCanvas(
      id,
      user.id,
      name
    );

    if (!canvas) {
      return c.json(
        {
          message: "Canvas not found",
        },
        404
      );
    }

    return c.json(canvas);
  }
);

router.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");

  const id = c.req.param("id")!;

  const canvas = await deleteCanvas(
    id,
    user.id
  );

  if (!canvas) {
    return c.json(
      {
        message: "Canvas not found",
      },
      404
    );
  }

  return c.json(canvas);
});

router.patch(
  "/:id/content",
  requireAuth,
  zValidator("json", updateCanvasContentSchema),
  async (c) => {
    const user = c.get("user");

    const id = c.req.param("id")!;

    const { content } = c.req.valid("json");

    const canvas = await updateCanvasContent(
      id,
      user.id,
      content
    );

    if (!canvas) {
      return c.json(
        {
          message: "Canvas not found",
        },
        404
      );
    }

    return c.json(canvas);
  }
);
export default router;