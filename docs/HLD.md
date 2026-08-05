# Blueprint — High-Level Design (HLD)

## 1. Purpose

Blueprint is a full-stack collaborative whiteboarding and diagramming application. Users sign up/sign in, organize their drawings into **workspaces**, fill workspaces with **canvases**, and draw on each canvas with the Excalidraw editor. Every canvas is saved as a durable document and is scoped privately to its owner.

**Users**
- Individual creators who want persisted whiteboards, organized and retrievable later.
- A "canvas" is the atomic drawing document; a "workspace" is a folder that groups canvases.

## 2. System context

```
                     ┌──────────────────────────────────────────────┐
                     │                     Blueprint                 │
                     │                                              │
  Browser ───────►   │  ┌────────────┐        ┌──────────────────┐  │
  (React SPA)   ── /api ─►  Hono API  ──►   │  PostgreSQL       │  │
  MUI + Excal       │  │  app        │        │  (Neon)          │  │
                     │  │  BetterAuth │        │  user/workspaces/│  │
                     │  └────────────┘        │  canvases        │  │
                     │            │Drizzle ORM│                  │  │
                     │            └───────────► └──────────────────┘  │
                     └──────────────────────────────────────────────┘
```

### Components

| Component           | Technology                          | Responsibility                                   |
| ------------------- | ----------------------------------- | ------------------------------------------------ |
| **Frontend (SPA)**  | React 19, Vite 8, TanStack Router, MUI, Excalidraw | UI, routing, drawing editor, client caching |
| **Backend (API)**   | Hono (TypeScript)                   | HTTP API: auth, workspaces, canvases             |
| **Identity**        | Better Auth (email/password)        | Sign-up/in/out, sessions, cookie issuance        |
| **Persistence**     | PostgreSQL (Neon) via Drizzle ORM   | All durable state                                |
| **Deploy**          | Vercel (serverless), Node (local)   | Serving the SPA + API                            |

## 2. Architectural style

**Modular monolith API + thin SPA client.**

- One backend service exposes a JSON REST API; one frontend SPA consumes it. There is no service mesh/CD, no message queue/event bus, no microservice split.
- The API is organized as **domain modules** (auth, workspaces, canvases), each following a consistent **routes → service → validators** layering. This is the primary pattern for maintainability and is the right scale for a product of this size — it can be split later if needed.
- The frontend uses **co-located routes and components** and deliberately **minimal state management** (local component state + a single cached session module), avoiding Redux/Query layers for simplicity.

## 3. Component breakdown

### 3.1 Frontend (SPA)
| Group | Pieces | Notes |
| ---- | ------ | ---- |
| Routing | `src/router.ts`, `src/routeTree.gen.ts`, `src/routes/**` | File-based TanStack Router; auto-code-splitting |
| Pages | Landing, SignIn, SignUp, Dashboard, Workspace, Canvas editor | Map in README |
| UI | MUI components, `DashboardLayout` (Sidebar/TopBar), `TileActions` | Dark theme |
| Drawing | `CanvasWorkspace` + Excalidraw | Hydrate + debounced auto-save |
| Data access | `lib/api.ts` (`request()`, authApi/workspaceApi/canvasApi) | Typed fetch wrapper |
| Session | `lib/auth.ts` (cache + guards), `lib/authValidation.ts` | |

### 3.2 Backend (API)
| Module | Files | Responsibility |
|--------|-------|----------------|
| App shell | `app.ts`, `index.ts` | CORS, error handler, route mounting, server bootstrap |
| Auth | `modules/auth/auth.ts`, `middleware.ts` | betterAuth instance; `requireAuth` guard |
| Workspaces | `routes|service|validators.ts` | WS CRUD, owner-scoped |
| Canvases | `routes|service|validators.ts` | Canvas CRUD + content save, owner-scoped |
| DB | `db/index.ts`, `db/schema/*.ts` | Drizzle client + schema |
| Errors | `modules/errors.ts` | `HttpError` |

## 4. Data flow

### 4.1 Normal request (e.g. list workspaces)
```
React component
   │  workspaceApi.getAll()
   ▼
lib/api.ts  request<T>()  fetch("/api/workspaces", credentials: include)
   │  (dev: Vite proxy → localhost:3000; prod: same origin via Vercel)
   ▼
Hono app.ts ── CORS ──────────────────────────────► onError (if HttpError)
   │
   ▼
workspaces/routes.ts: GET /
   │   requireAuth (middleware)
   ▼
   │   service.getWorkspaces(user.id)         ──► Drizzle query
   │   ◦ where ownerId = user.id            ──► workspaces LEFT JOIN canvases, count
   ▼
Hono returns JSON { id, name, ownerId, createdAt, updatedAt, canvasesCount }
   │
   ▼
client resolves typed Workspace[]
```

### 4.2 Canvas auto-save (editor)
```
Excalidraw onChange
   └─► debounce 1.5s (useRef timer)
          └─► canvasApi.updateContent(id, { elements, appState })
                 └─► PATCH /api/canvases/:id/content { content }
                        └─► service.updateCanvasContent (owner-scoped) → UPDATE canvases SET content
```

### 4.3 Sign-in
```
authApi.signIn → POST /api/auth/sign-in/email (Better Auth)
   └─► sets session cookie (HttpOnly) on response
          └─► client clears session cache, router redirect → /dashboard
```

## 5. Security design

- **Cookie-based sessions** via Better Auth (HttpOnly cookie sent with `credentials: "include"`).
- **Auth guard at the API layer**: `requireAuth` returns 401 when no session; it injects `user`/`session` into the Hono context.
- **Ownership at the DB query level**: workspaces are queried `WHERE ownerId = <userId>`; canvases are resolved through an inner join on `workspaces.ownerId`. A resource you don't own is indistinguishable from a nonexistent one (404 vs 403 — no existence leak).
- **Input validation** via zod (`@hono/zod-validator`) on every write body.
- **CORS restricted** to a configurable origin (`CLIENT_ORIGIN`/`BETTER_AUTH_URL`), credentials enabled.
- **Global error handler** normalizes errors; no stack traces leak to clients.

## 6. Availability & scaling

- Stateless API (session lookup is DB-backed); horizontal scaling of the Hono app is safe.
- Postgres is the single stateful dependency (Neon managed Postgres handles replication/backups).
- No cache layer, no queues, no background jobs — beyond an in-memory session memo. Suitable for the app's scale.

## 7. Key design decisions

1. **Hono + Drizzle + Postgres** — lightweight, typed, web-standard, easy serverless deploy on Vercel.
2. **Better Auth** — avoids custom auth boilerplate, owns session/SQL tables.
3. **Single backend module layering** — thin routes, business logic in services, keeps ownership checks consistent.
4. **File-based routing + MUI + Excalidraw** — fast iteration; Excalidraw provides a full editor with zero-effort serializable `{elements, appState}`.
5. **Minimal frontend state** — local state + cached session module; auth guards at route `beforeLoad`.
6. **Relative URLs + dev proxy** — the frontend uses relative `/api` paths; the dev proxy and Vercel rewrites mean deployment swaps nothing in code.

## 8. Technology rationale

| Choice | Reason |
|--------|--------|
| React 19 + Vite 8 | Fast HMR, React Compiler, strong TS integration |
| MUI | Rich components, dark theme consistency |
| Excalidraw | Mature open-source whiteboard with serialization |
| Hono | Web standard, tiny, serverless-friendly (Vercel adapter) |
| Drizzle ORM + pg | Type-safe, migrations tooling, SQL clarity |
| zod | Runtime-safe input at the boundary |
| PostgreSQL (Neon) | Managed, serverless-friendly, relational integrity |
| Vercel | Unified hosting for SPA + serverless API |

## 9. Constraints & non-goals (current scope)

- **No real-time collaboration** (single-user editor; changes are auto-saved by the local client).
- **No sharing/teams/permission model** beyond owner scoping.
- **No structured file/document uploads**; canvases store only Excalidraw JSON.
- **No pagination/infinite scroll** on large canvases or workspace lists (assumes modest volume).