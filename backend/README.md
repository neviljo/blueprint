# Blueprint Backend

The API server for Blueprint — a REST API providing authentication, user workspaces, and canvases (Excalidraw documents). Built with Hono, Better Auth, Drizzle ORM, and PostgreSQL.

## Stack

- **Framework:** [Hono](https://hono.dev/) `^4` (web-standard router)
- **Runtime:** `@hono/node-server` (Node HTTP server, port 3000) in dev/local; Vercel serverless via `../api/index.ts` in production
- **Auth:** [Better Auth](https://www.better-auth.com/) `^1.6` (email/password, cookie-based sessions)
- **Database:** PostgreSQL via [Neon](https://neon.tech/), accessed with `drizzle-orm` + `pg`; migrations with `drizzle-kit`
- **Validation:** [zod](https://zod.dev/) `^4` + `@hono/zod-validator`
- **Language:** TypeScript (strict, `NodeNext` ESM, `verbatimModuleSyntax`)

## Directory structure

```
backend/
├── drizzle/                      # Migration SQL + meta snapshots
├── src/
│   ├── index.ts                  # Local server bootstrap (serve on :3000)
│   ├── app.ts                    # Hono app: CORS, error handler, route mounting
│   ├── types/hono.ts             # Context type augmentation (c.get("user"/"session"))
│   ├── db/
│   │   ├── index.ts              # Drizzle client + pg Pool (from DATABASE_URL)
│   │   └── schema/               # auth.ts, workspaces.ts, canvases.ts
│   └── modules/
│       ├── errors.ts             # HttpError class (status + message)
│       ├── auth/
│       │   ├── auth.ts           # betterAuth instance (drizzle adapter)
│       │   └── middleware.ts     # requireAuth guard
│       ├── workspaces/           # routes.ts, service.ts, validators.ts
│       └── canvases/             # routes.ts, service.ts, validators.ts
├── drizzle.config.ts             # drizzle-kit config (schema, out dir)
└── tsconfig.json
```

## Architecture

The app follows a **routes → service → database** layering, one module per domain:

```
HTTP request
   │
   ▼
app.ts ── CORS, error handling
   │
   ▼
module/routes.ts ── auth middleware + zod validation (thin HTTP layer)
   │
   ▼
module/service.ts ── Drizzle queries, ownership checks (business logic)
   │
   ▼
PostgreSQL (via db/index.ts)
```

- **Routes** stay thin: mount `requireAuth`, validate the body with zod, call a service, return JSON.
- **Services** contain all DB access and enforce ownership (e.g. workspaces are always queried `WHERE ownerId = currentUserId`). Route handlers never touch the database directly.
- A global `onError` handler converts `HttpError` into `{ message }` responses with the matching status (500 otherwise), keeping error shapes uniform.

### Auth flow

- `betterAuth` is configured with the Drizzle adapter and email/password.
- `requireAuth` (in `modules/auth/middleware.ts`) calls `auth.api.getSession({ headers })`. If there is no session it returns `401 { message: "Unauthorized" }`; otherwise it stores `user` and `session` in the Hono context (type-safe via `types/hono.ts`).
- Sessions are cookie-based; the frontend sends them with `credentials: "include"`.

### CORS

Applied to `/api/*` with `credentials: true`. Allowed origin comes from `CLIENT_ORIGIN`, falling back to `BETTER_AUTH_URL`, then `http://localhost:5173`.

## API reference

Base path: `/api`. Endpoints marked 🔒 require an authenticated session.

### Health

| Method | Path      | Description          |
| ------ | --------- | -------------------- |
| GET    | `/health` | `{ success: true }`  |

### Auth

Mounted at `/api/auth/*` and handled entirely by Better Auth.

| Method | Path                  | Description              |
| ------ | --------------------- | ------------------------ |
| GET    | `/api/auth/get-session` | Fetch current session    |
| POST   | `/api/auth/sign-in/email` | Sign in with email/password |
| POST   | `/api/auth/sign-up/email` | Create account          |
| POST   | `/api/auth/sign-out` | End session              |

### Workspaces 🔒

| Method | Path                        | Description                              |
| ------ | --------------------------- | ---------------------------------------- |
| POST   | `/api/workspaces`           | Create workspace `{ name }` → 201        |
| GET    | `/api/workspaces`           | List user's workspaces (with `canvasesCount`) |
| GET    | `/api/workspaces/:id`       | Get one workspace (owner-scoped, else 404) |
| PATCH  | `/api/workspaces/:id`       | Rename `{ name }`                        |
| DELETE | `/api/workspaces/:id`       | Delete (cascades to canvases)            |

Validation: `name` trimmed, 1–100 characters.

### Canvases 🔒

| Method | Path                              | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| POST   | `/api/canvases`                   | Create canvas `{ name, workspaceId }` → 201 (verifies workspace ownership) |
| GET    | `/api/canvases/workspace/:workspaceId` | List canvases in a workspace        |
| GET    | `/api/canvases/:id`               | Get one canvas (owner-scoped via workspace join) |
| PATCH  | `/api/canvases/:id`               | Rename `{ name }`                        |
| PATCH  | `/api/canvases/:id/content`       | Save drawing `{ content }` (JSON string, defaults `"[]"`) |
| DELETE | `/api/canvases/:id`               | Delete                                  |

Ownership checks: canvas operations look up the canvas through an inner join on `workspaces.ownerId`, so a canvas from someone else's workspace is indistinguishable from one that doesn't exist.

## Database schema

Migrations live in `drizzle/` (generate/push via `drizzle-kit`). Tables:

| Table          | Key columns                                       | Notes                                   |
| -------------- | ------------------------------------------------- | --------------------------------------- |
| `user`         | id (text PK), name, email (unique), emailVerified, image, timestamps | Better Auth user          |
| `session`      | id, expiresAt, token (unique), ipAddress, userAgent, userId (FK) | Auth sessions             |
| `account`      | id, userId (FK), OAuth + password fields          | OAuth/password accounts                 |
| `verification` | id, identifier, value, expiresAt                  | Email verification tokens               |
| `workspaces`   | id (uuid PK, `gen_random_uuid`), name, ownerId (FK → user), timestamps | One per user-created workspace |
| `canvases`     | id (uuid PK), name, workspaceId (FK → workspaces), content (text, default `'[]'`), timestamps | Canvas drawing document |

All foreign keys use `ON DELETE CASCADE`, so deleting a user removes their sessions/accounts/workspaces, and deleting a workspace removes its canvases.

`canvases.content` stores the serialized Excalidraw scene (`elements` + `appState`) as a JSON string.

## Environment variables

Create `backend/.env`:

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=<random secret>
BETTER_AUTH_URL=http://localhost:3000
CLIENT_ORIGIN=http://localhost:5173
```

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Dev server on :3000 (`tsx watch src/index.ts`) |
| `npm run build`    | Compile to `dist/` (`tsc`)               |
| `npm run start`    | Run compiled output (`node dist/index.js`) |
| `npm run db:generate` | Generate a migration from schema      |
| `npm run db:migrate`  | Apply migrations                        |
| `npm run db:push`  | Push schema without a migration file     |
