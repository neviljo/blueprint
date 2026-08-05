# Blueprint — Low-Level Design (LLD)

Complements [HLD.md](./HLD.md). This document details modules, functions, types, data contracts, and flows at the code level so any engineer can navigate and modify the system predictably.

---

## 1. Repository layout (source of truth)

```
blueprint/
├── api/index.ts                  # Vercel serverless adapter
├── backend/src/
│   ├── index.ts                  # local server bootstrap
│   ├── app.ts                    # Hono app assembly
│   ├── types/hono.ts             # Context variable types
│   ├── db/
│   │   ├── index.ts              # Drizzle + pg Pool
│   │   └── schema/  auth.ts · workspaces.ts · canvases.ts · index.ts
│   └── modules/
│       ├── errors.ts                 # HttpError
│       ├── auth/  auth.ts · middleware.ts
│       ├── workspaces/  routes.ts · service.ts · validators.ts
│       └── canvases/    routes.ts · service.ts · validators.ts
├── frontend/src/
│   ├── main.tsx · router.ts · routeTree.gen.ts
│   ├── lib/  api.ts · auth.ts · authValidation.ts · types.ts
│   ├── theme/theme.ts
│   ├── routes/  __root · index · signin · signup · dashboard/* · canvas/$canvasId
│   └── components/  layouts/, Auth*, Canvas*, Workspace*, Sidebar, TopBar, TileActions, landing/
└── vercel.json · package.json
```

---

## 2. Backend — module-by-module

### 2.1 App shell (`app.ts`)

```ts
const origin = process.env.CLIENT_ORIGIN ?? process.env.BETTER_AUTH_URL ?? "http://localhost:5173";

app.use("/api/*", cors({ origin, allowHeaders:["Content-Type","Authorization"], allowMethods:["GET","POST","PATCH","DELETE","OPTIONS"], credentials:true }));

app.onError((err, c) => { /* HttpError -> status, else 500 -> { message } */ });

app.on(["GET","POST"], "/api/auth/*", c => auth.handler(c.req.raw));   // Better Auth
app.route("/api/workspaces", workspaceRoutes);
app.route("/api/canvases", canvasRoutes);
app.get("/health", c => c.json({ success: true }));
```

- **CORS**: enabled for `/api/*`, credentials allowed, scoped origin.
- **onError**: `HttpError.status` else 500; body `{ message }`.
- `index.ts` runs the same `app` via `@hono/node-server` on port 3000. `api/index.ts` exports `handle(app)` for Vercel.

**Type augmentation (`types/hono.ts`)**: extends Hono's `ContextVariableMap` so `c.get("user")` / `c.get("session")` are typed. Injected by `requireAuth`.

### 2.2 Errors (`modules/errors.ts`)

```ts
export class HttpError extends Error {
  status: ContentfulStatusCode;         // HTTP status code
  constructor(status, message) { super(message); this.status = status; this.name = "HttpError"; }
}
```
Used by services to abort with a specific status (e.g. `new HttpError(404, "Workspace not found")`).

### 2.3 Auth (`modules/auth/`)

**`auth.ts`** — the Better Auth instance:
- `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }), emailAndPassword: { enabled: true } })`.
- Handles `/session`, sign-in/up/out under `/api/auth/*`, and owns tables `user`, `session`, `account`, `verification` (see schema).
- Reads `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

**`middleware.ts`** — `requireAuth`:
1. `await auth.api.getSession({ headers: c.req.raw.headers })`.
2. If `!session` → `return c.json({ message: "Unauthorized" }, 401)`.
3. Else `c.set("user", ...)`, `c.set("session", ...)`; fall through.

### 2.4 Workspaces module

**`validators.ts`**
```ts
createWorkspaceSchema = z.object({ name: string().trim().min(1, "...required").max(100) });
updateWorkspaceSchema = z.object({ name: string().trim().min(1).max(100) });
```

**`service.ts`** (all owner-scoped via `eq(workspaces.ownerId, ownerId)`):

| Function | SQL intent |
|----------|-----------|
| `createWorkspace(name, ownerId)` | `INSERT ... RETURNING` |
| `getWorkspaces(ownerId)` | `SELECT ws.*, count(canvases.id) AS canvasesCount FROM ws LEFT JOIN canvases GROUP BY ws.id ORDER BY created_at DESC` |
| `getWorkspaceById(id, ownerId)` | `SELECT WHERE id AND owner_id` |
| `updateWorkspace(id, ownerId, name)` | `UPDATE SET name, updated_at WHERE id AND owner_id RETURNING` |
| `deleteWorkspace(id, ownerId)` | `DELETE WHERE id AND owner_id RETURNING` |
| `getWorkspaceByIdAndOwner(workspaceId, ownerId)` | helper reused by canvases module |

**`routes.ts`** — each handler: `requireAuth`, optional `zValidator("json", schema)`, parse `c.req.valid`/`c.req.param`, call service, return JSON. `GET /:id` and `DELETE /:id` return 404 `{ message }` when the service returns `undefined`.

### 2.5 Canvases module

**`validators.ts`**
```ts
createCanvasSchema      = { name: z.string().trim().min(1).max(100), workspaceId: z.uuid() };
updateCanvasSchema      = { name: z.string().trim().min(1).max(100) };
updateCanvasContentSchema = { content: z.string() };
```

**`service.ts`**
- `assertWorkspaceOwnership(workspaceId, ownerId)` — calls `getWorkspaceByIdAndOwner`; throws `HttpError(404, "Workspace not found")` if missing. Guards create/list.
- `createCanvas(name, workspaceId, ownerId)` — assert ownership → `INSERT RETURNING`.
- `getCanvasesByWorkspace(workspaceId, ownerId)` — assert ownership → `SELECT WHERE workspace_id ORDER BY created_at DESC`.
- `getCanvasById(id, ownerId)` — **ownership via join**: `workspaces INNER JOIN canvases WHERE canvases.id = ? AND workspaces.owner_id = owner` → returns `result?.canvases` (undefined if not owned). The single choke point for ownership.
- `updateCanvas(id, ownerId, name)` — resolve ownership via `getCanvasById`, else `null`; then `UPDATE name`. Returns `null` if unowned.
- `deleteCanvas(id, ownerId)` — ownership check → `DELETE RETURNING`.
- `updateCanvasContent(id, ownerId, content)` — ownership check → `UPDATE content, updated_at RETURNING`.

**`routes.ts`** mirrors workspaces. Differences:
- `POST /` validates `createCanvasSchema`, requires `workspaceId`.
- `GET /workspace/:workspaceId` returns list, 404 on unowned workspace (via thrown HttpError).
- `PATCH /:id/content` validates `updateCanvasContentSchema`; 404 if service returns `null`.

### 2.6 Database — schema & Drizzle

**`db/index.ts`**
```ts
export const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL! }));
```

**Tables** (Postgres):

`user` (from Better Auth) — id text PK, name, email unique, emailVerified, image, createdAt, updatedAt.

`session` — id, expiresAt, token unique, ipAddress, userAgent, userId **FK→user CASCADE**, indexed(userId).
`account` — id, userId FK→user CASCADE, provider fields (accessToken/refreshToken/accessTokenExpiresAt/scope/password), indexed(userId).
`verification` — id, identifier, value, expiresAt.

`workspaces`:
| column | type | notes |
|--------|------|-------|
| `id` | uuid PK | `defaultRandom()` |
| `name` | text NOT NULL | validated 1–100 |
| `owner_id` | text NOT NULL | FK→user.id CASCADE |
| `created_at` | timestamp NK | `defaultNow()` |
| `updated_at` | timestamp NK | `$onUpdate(() => new Date())` |

`canvases`:
| column | type | notes |
|--------|------|-------|
| `id` | uuid PK | `defaultRandom()` |
| `name` | text NOT NULL | |
| `workspace_id` | uuid NOT NULL | FK→workspaces.id CASCADE |
| `content` | text NOT NULL DEFAULT `'[]'` | Excalidraw JSON |
| `created_at` / `updated_at` | timestamps | |

**Relations (Drizzle `relations`)**: users→workspaces/sessions/accounts; workspace.owner→user; canvas.workspace→workspace. Cascade deletes keep the graph consistent.

---

## 3. Frontend — module-by-module

### 3.1 Bootstrap & routing
- `index.html` → `src/main.tsx` renders `<StrictMode><RouterProvider router={router}/></StrictMode>`.
- `src/router.ts`: `createRouter({ routeTree, notFoundMode: "root" })`.
- `src/routeTree.gen.ts`: auto-generated by `@tanstack/router-plugin` (route files under `routes/`, `autoCodeSplitting: true`). **Do not hand-edit.**
- `routes/__root.tsx`: `ThemeProvider` (dark) + `CssBaseline` + `<Outlet/>` + global `NotFound`.

**Route map:**

| Path | File | Guard / behavior |
|------|------|------------------|
| `/` | `routes/index.tsx` | redirect to `/dashboard` if signed in (`beforeLoad`) |
| `/signin` `/signup` | `routes/signin|signup.tsx` | redirect to `/dashboard` if signed in |
| `/dashboard` | `routes/dashboard/route.tsx` | `beforeLoad: requireAuth()` → layout |
| `/dashboard` | `routes/dashboard/index.tsx` | `WorkspaceDashboard` |
| `/dashboard/workspaces/$workspaceId` | `routes/dashboard/workspaces/$workspaceId.tsx` | `WorkspaceView` |
| `/canvas/$canvasId` | `routes/canvas/$canvasId.tsx` | `beforeLoad: requireAuth()` → `CanvasWorkspace` |

### 3.2 `lib/types.ts`
```ts
CanvasContent { elements: ExcalidrawElement[]; appState: RecursivePartial<AppState> }
AuthResult    { user: AuthUser | null; session: UserSession['session'] | null; error?: ... }
SignOutResult { /* empty */ }
UserSession   { user: AuthUser | null; session: Session | null }
```

### 3.3 `lib/api.ts` — transport
```ts
const API_BASE_URL = "";
async function request<T>(endpoint, options) {
  headers { "Content-Type":"application/json", ...options.headers }
  fetch(endpoint, { ...options, headers, credentials: "include" });
  if (!ok) throw new Error(extract message || statusText);   // `.message` || `.error`
  return response.json();
}
```
Exposed clients (all thin wrappers over `request`):
- `authApi.{getSession, signIn, signUp, signOut}`
- `workspaceApi.{getAll, getById, create, update, delete}`
- `canvasApi.{getByWorkspace, getById, create, update, updateContent, delete}`
- `getSession` catches errors → `{ user: null, session: null }` (treat network failure as signed-out).

**Types**: `Workspace { id, name, userId, createdAt, updatedAt, canvasesCount? }`, `Canvas { id, name, workspaceId, userId, content?, createdAt, updatedAt }` (interfaces in api.ts).

### 3.4 `lib/auth.ts` — session cache & guards
```ts
let cachedSession: UserSession | null | undefined;         // undefined = never fetched
getCurrentSession(force=false)          // fetch once, memoize; force bypasses
clearSessionCache()                    // reset after login/logout
async requireAuth()                      // getCurrentSession(); if no user throw redirect("/")
```
- Used as `beforeLoad` in route definitions. Landing page uses the inverse (redirect signed-in users).

### 3.5 `lib/authValidation.ts`
Client-side zod/form validation for signin/signup fields (mirrors backend shape).

### 3.6 Components

- **`layouts/DashboardLayout`** — Responsive `Sidebar` (permanent drawer ≥ tablet; temporary + hamburger on mobile) + `TopBar`.
  - `Sidebar`: branding + nav (Dashboard/Analytics/Users/Settings — Analytics/Users/Settings are inert stubs).
  - `TopBar`: logo→`/`, user avatar menu (Profile, Settings, Sign Out), Sign In button when logged out; logout → `clearSessionCache()`, navigate `/`.
- **`WorkspaceDashboard`** — `useEffect` → `workspaceApi.getAll()`, grid of `WorkspaceTile` (name + `canvasesCount`), "New Workspace" dialog → `create()`, delete via `TileActions`.
- **`WorkspaceView`** — fetches workspace name + `canvasApi.getByWorkspace(workspaceId)`; grid of `CanvasTile` (fake Excalidraw preview + object count from `content.elements.length`); "New Canvas" dialog.
- **`TileActions`** — three-dot menu with Delete + confirmation dialog (workspaces & canvases).
- **`CanvasWorkspace`** (route `/canvas/$canvasId`) — load flow:
  1. `canvasApi.getById(id)` → parse `content` JSON into `{ elements, appState }` → hydrate `<Excalidraw initialData>`.
  2. `onChange` → debounce 1.5s via `useRef` timer → `canvasApi.updateContent(id, content)`.
  3. Back button → navigate to workspace; theme toggle updates `appState.theme` + saves.

### 3.7 Build/dev plumbing
- `vite.config.ts`: plugins `[tanstackRouter, react]`; `server.proxy { '/api': { target:'http://localhost:3000', changeOrigin:true } }`.
- Env define: `process.env.NODE_ENV`.
- `frontend/package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `lint`, `preview`.

---

## 4. Request lifecycle (one annotated trace)

**Create canvas**
```
POST /api/canvases  { "name": "Sketch A", "workspaceId": "<uuid>" }
  1. CORS allowed (origin match)
  2. routes.ts: requireAuth → getSession() ok → sets user
  3. zValidator("json", createCanvasSchema) → validated { name, workspaceId }
  4. service.createCanvas(name, workspaceId, user.id)
       └─ assertWorkspaceOwnership -> workspaces.service.getWorkspaceByIdAndOwner
             └─ SELECT WHERE id=? AND owner_id=?  [else HttpError 404]
       └─ INSERT canvases RETURNING
  5. 201 { canvas }
```

## 5. Error contract

All API errors are `{ message: string }`.
- Unauthenticated → `401`.
- Validation failure (bad body) → handled by `@hono/zod-validator` (422 / its default).
- Not found / not owned → `404` (from route returns or `HttpError`).
- Unexpected → `500`.

The client's `request()` throws `Error(message)` so callers see the user-facing reason.

---

## 6. Testing & verification references

- Backend service behaviors are exercised through the routes (no unit-test suite present).
- Run type checks: `backend: npm run build` (tsc), `frontend: npm run build` and `npm run lint`.

---

## 7. Change-playbooks (common tasks)

**Add a field to `workspaces`**
1. `db/schema/workspaces.ts` add column (with default for existing rows).
2. `npm run db:generate` → review migration → `npm run db:migrate`.
3. Update `createWorkspaceSchema`/`updateWorkspaceSchema`.
4. Update `service.ts` selects/inserts and `frontend/src/lib/api.ts` `Workspace` type.

**Change auto-save debounce**
1. `CanvasWorkspace.tsx` — adjust the `useRef` timeout delay (currently 1500 ms).

**Add an OAuth provider**
1. Configure in `backend/src/modules/auth/auth.ts` (`socialProviders`).
2. Enable the corresponding button in `frontend` `SocialLoginButtons.tsx` (currently disabled stubs).

**Deploy**
1. Root `npm run build` → builds `backend/dist` then `frontend/dist`.
2. Vercel: `vercel.json` serves SPA at root, API at `/api`, `api/index.ts` is the serverless entry.