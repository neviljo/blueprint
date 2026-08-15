# Blueprint

A full-stack collaborative whiteboarding and diagramming app. Users sign in, create **workspaces**, fill them with **canvases**, and draw on each canvas using the [Excalidraw](https://excalidraw.com/) editor. Drawings auto-save back to the server, so every canvas is a durable document.

## Overview

```
┌───────────────────────┐         ┌────────────────────────────────────────────┐
│  Frontend (SPA)       │         │  Backend (Hono)                            │
│  React 19 + Vite      │  /api   │                                            │
│  TanStack Router      │ ──────► │  Better Auth ──► user / session / account  │
│  MUI + Excalidraw     │         │  workspaces routes ──► services ─┐         │
│                       │ ◄────── │  canvases routes ────► services ─┤         │
│                       │  JSON   │                                   ▼        │
└───────────────────────┘         │                         Drizzle ORM       │
                                  │                              │             │
                                  │                              ▼             │
                                  │                       PostgreSQL (Neon)   │
                                  └────────────────────────────────────────────┘
```

The SPA talks to the API via `fetch` with `credentials: "include"` (cookie-based sessions). During development the Vite dev server proxies `/api` to the local backend; in production both are served from a single Vercel deployment.

## Repo structure

```
blueprint/
├── api/          # Vercel serverless adapter (re-exports the compiled backend)
├── backend/      # Hono REST API + Better Auth + Drizzle/Postgres
├── frontend/     # React SPA (landing, auth, dashboard, canvas editor)
├── vercel.json   # Vercel routing/build config
└── package.json  # Root orchestration (npm run build builds backend + frontend)
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for detailed docs on each half. For deeper architecture docs, see [docs/HLD.md](docs/HLD.md) (high-level design) and [docs/LLD.md](docs/LLD.md) (low-level design).

## Tech stack

| Layer    | Technology                                                            |
| -------- | --------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 8, TanStack Router, Material UI, Excalidraw |
| Backend  | Hono, Better Auth, Drizzle ORM, PostgreSQL (Neon), zod, `pg`          |
| Realtime | Ably (token auth, presence for cursors, channels for scene sync)      |
| Auth     | Better Auth (email/password), cookie-based sessions                    |
| Deploy   | Vercel (serverless via `api/index.ts`), Node server for local dev      |

## Data model

The database has six tables. Deleting a parent cascades to children (`ON DELETE CASCADE`).

```
user ──< session          user ──< account        verification (email tokens)
user ──< workspaces ──< canvases
  workspaces: id (uuid), name, ownerId -> user
  canvases:   id (uuid), name, workspaceId -> workspaces, content (text, JSON)
```

Canvas `content` stores the serialized Excalidraw scene (an array of `elements` plus `appState`) as a JSON string. Every workspace/canvas query is scoped by the current user's `ownerId`, so users can never see each other's data.

## Realtime collaboration (Ably)

While a canvas is open, the Excalidraw editor syncs live between members of the canvas's workspace:

- **Presence** streams each user's pointer position and identity, rendered as collaborator cursors.
- A **channel** (`canvas:<canvasId>:collab`) carries scene updates (`elements` + theme) between active users; changes are debounced and reconciled by element version, so stale scenes from newly-joined or reconnecting clients don't overwrite fresher content.
- The frontend never sees the API key. It authenticates via `authCallback` → `GET /api/canvases/:id/ably-token`, which checks the session cookie and workspace membership, then returns a short-lived (1h) token scoped to **exactly that canvas's channel** with only `publish`/`subscribe`/`presence`.

> **Setup:** set `ABLY_API_KEY` in `backend/.env` and on Vercel. In the Ably dashboard, the key must be granted at least **Publish, Subscribe, and Presence** capabilities — a key limited to Subscribe will authenticate but fail to publish or enter presence.

## API surface

| Area | Endpoints |
| ---- | --------- |
| Auth | `GET /api/auth/get-session`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`, `POST /api/auth/sign-out` |
| Workspaces | `GET/POST /api/workspaces`, `GET/PATCH/DELETE /api/workspaces/:id` |
| Canvases | `GET /api/canvases/workspace/:workspaceId`, `POST /api/canvases`, `GET/PATCH/DELETE /api/canvases/:id`, `PATCH /api/canvases/:id/content`, `GET /api/canvases/:id/ably-token` |
| Health | `GET /health` |

All workspace/canvas routes require a valid session.

## Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (e.g. Neon) — the project ships migrations under `backend/drizzle/`

### 1. Backend

```bash
cd backend
cp .env.example .env   # if present, otherwise create .env (see below)
npm install
npm run db:migrate     # apply schema migrations
npm run dev            # http://localhost:3000
```

Required env vars in `backend/.env`:

| Variable             | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `DATABASE_URL`       | Postgres connection string                          |
| `BETTER_AUTH_SECRET` | Secret used to sign auth cookies/tokens             |
| `BETTER_AUTH_URL`    | Base URL of the auth service                        |
| `CLIENT_ORIGIN`      | Allowed CORS origin (falls back to `BETTER_AUTH_URL`, then `http://localhost:5173`) |
| `ABLY_API_KEY`       | Ably app key used to mint realtime tokens for canvas collaboration    |

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api -> localhost:3000)
```

### 3. Use it

Open http://localhost:5173, sign up, create a workspace, add a canvas, and start drawing.

### Scripts

| Command                  | Where        | What it does                                   |
| ------------------------ | ------------ | ---------------------------------------------- |
| `npm run dev`            | `backend/`   | Dev server on :3000 (`tsx watch`)              |
| `npm run dev`            | `frontend/`  | Vite dev server on :5173                       |
| `npm run build`          | root         | Installs backend, runs `db:migrate`, builds backend, then frontend |
| `npm run build`          | `backend/`   | `tsc` compile to `dist/`                                            |
| `npm run build`          | `frontend/`  | `tsc -b && vite build` → `dist/`               |
| `npm run db:generate`    | `backend/`   | Generate a Drizzle migration from schema       |
| `npm run db:migrate`     | `backend/`   | Apply migrations                               |
| `npm run db:push`        | `backend/`   | Push schema directly (no migration file)       |
| `npm run lint`           | `frontend/`  | ESLint                                         |

## Deployment (Vercel)

- `api/index.ts` imports the **compiled** backend (`backend/dist/app.js`) and re-exports it as Vercel serverless handlers (`GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`).
- `vercel.json` sets the output directory to `frontend/dist`, rewrites `/api/*` → the serverless handler, and everything else → `index.html` (SPA fallback).
- The root `npm run build` installs backend deps, runs `db:migrate` (applies any new migrations to the database the build can reach), then builds the backend and frontend.
- **Database at deploy time:** `db:migrate` reads `DATABASE_URL`. Make sure the `DATABASE_URL` Vercel env var is set as a regular (non-encrypted/secret) env var so it's available during builds in addition to runtime. Migrations are recorded in `drizzle.__drizzle_migrations`, so re-runs are no-ops.
- `.gitignore` excludes `backend/dist/`, so the build step on Vercel is what produces it.

## Key files

| File | Purpose |
| ---- | ------- |
| `backend/src/app.ts` | Hono app: CORS, error handler, route mounting |
| `backend/src/index.ts` | Local Node server bootstrap (port 3000) |
| `backend/src/db/schema/*.ts` | Drizzle schema (auth, workspaces, canvases) |
| `backend/src/modules/*/routes.ts` | HTTP routes (validation + auth + delegation) |
| `backend/src/modules/*/service.ts` | DB queries (ownership-scoped) |
| `backend/src/modules/auth/middleware.ts` | `requireAuth` session guard |
| `frontend/src/router.ts` | TanStack Router instance |
| `frontend/src/routes/` | File-based routes (landing, auth, dashboard, canvas) |
| `frontend/src/lib/api.ts` | Typed fetch wrapper + auth/workspace/canvas API clients |
| `frontend/src/lib/auth.ts` | Session cache + auth guards |
| `frontend/src/components/CanvasWorkspace.tsx` | Excalidraw editor with debounced auto-save + Ably realtime collaboration |
| `api/index.ts` | Vercel serverless adapter |
