import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth } from "./modules/auth/auth.js";
import workspaceRoutes from "./modules/workspaces/routes.js";
import canvasRoutes from "./modules/canvases/routes.js";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "http://localhost:5173",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

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