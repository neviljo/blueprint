import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { requireAuth } from "../auth/middleware.js";

import { createCanvas,  getCanvasesByWorkspace, getCanvasById, updateCanvas, deleteCanvas, updateCanvasContent, appendCanvasDelta, getCanvasDeltasAfter, upsertCanvasPresence, getCanvasPresence, removeCanvasPresence} from "./service.js";
import { createCanvasTokenRequest } from "./ably.js";
import { createCanvasSchema, updateCanvasSchema, updateCanvasContentSchema, canvasSyncSchema, presenceSchema } from "./validators.js";

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

// Appends a scene delta to the canvas's sync log. This is the HTTP path that
// serves as the source of truth for scene sync — it works even when the
// realtime (Ably) channel is unreachable.
router.post(
  "/:id/sync",
  requireAuth,
  zValidator("json", canvasSyncSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const body = c.req.valid("json");

    const delta = await appendCanvasDelta(id, user.id, user.id, body);

    return c.json({ seq: delta.seq }, 201);
  }
);

// Returns scene deltas newer than ?after=<seq> plus the current latest seq so
// clients can track their polling baseline in one round trip.
router.get("/:id/sync", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;

  const afterParam = c.req.query("after");
  const afterSeq = Number.parseInt(afterParam ?? "0", 10);
  const parsedAfter = Number.isFinite(afterSeq) && afterSeq >= 0 ? afterSeq : 0;

  const result = await getCanvasDeltasAfter(id, user.id, parsedAfter);

  const presence = await getCanvasPresence(id, user.id);

  return c.json({
    deltas: result.deltas.map((delta) => ({
      seq: delta.seq,
      elements: (delta.payload as { elements: unknown }).elements,
      sceneVersion: (delta.payload as { sceneVersion: number }).sceneVersion,
      full: (delta.payload as { full: boolean }).full,
    })),
    latestSeq: result.latestSeq,
    presence,
  });
});

// Heartbeat: keeps this user marked online for the canvas. Independent of
// the Ably channel, so the collaborator avatar stack works without realtime.
router.post(
  "/:id/presence",
  requireAuth,
  zValidator("json", presenceSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id")!;
    const body = c.req.valid("json");

    const result = await upsertCanvasPresence(id, user.id, body);

    return c.json(result);
  }
);

// Returns users who have heartbeated within the active window (recently
// online) for this canvas, pruning rows that stopped heartbeating.
router.get("/:id/presence", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;

  const members = await getCanvasPresence(id, user.id);

  return c.json({ members });
});

// Marks this user offline (called when the client disconnects/unmounts).
router.delete("/:id/presence", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id")!;

  const result = await removeCanvasPresence(id, user.id);

  return c.json(result);
});

// Returns a signed Ably token request so the Excalidraw client can join the
// realtime channel for this canvas. Only authenticated members of the
// canvas's workspace can request one; the token is scoped to this canvas only.
router.get("/:id/ably-token", requireAuth, async (c) => {
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

  const tokenRequest = await createCanvasTokenRequest(id, user.id);

  return c.json(tokenRequest);
});

export default router;