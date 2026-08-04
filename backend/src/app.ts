import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth } from "./modules/auth/auth.js";
import workspaceRoutes from "./modules/workspaces/routes.js";
import canvasRoutes from "./modules/canvases/routes.js";

const origin = process.env.CLIENT_ORIGIN ?? process.env.BETTER_AUTH_URL ?? "http://localhost:5173";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      message: err instanceof Error ? err.message : "Internal Server Error",
    },
    500
  );
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.route("/api/workspaces", workspaceRoutes);
app.route("/api/canvases", canvasRoutes);
app.get("/health", (c) => {
  return c.json({
    success: true,
  });
});

export default app;