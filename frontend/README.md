# Blueprint Frontend

The single-page web application for Blueprint — a collaborative whiteboarding and diagramming app. Users sign in, manage workspaces and canvases, and draw in a full-screen Excalidraw editor that auto-saves.

## Stack

- **UI:** React 19 + TypeScript
- **Build:** Vite 8 (Oxc), React Compiler enabled
- **Routing:** [TanStack Router](https://tanstack.com/router) `^1.170` (file-based, auto-generated route tree)
- **UI kit:** Material UI `^9` (`@mui/material`, `@mui/icons-material`, Emotion)
- **Whiteboard:** [Excalidraw](https://excalidraw.com/) `^0.18`
- **Auth client:** `better-auth` (cookie-based sessions, `credentials: "include"`)

## Directory structure

```
frontend/
├── src/
│   ├── main.tsx              # React bootstrap
│   ├── router.ts             # TanStack Router instance
│   ├── routeTree.gen.ts      # Auto-generated from routes/ (do not edit)
│   ├── index.css             # Global styles
│   ├── lib/
│   │   ├── api.ts            # fetch wrapper + authApi/workspaceApi/canvasApi
│   │   ├── auth.ts           # session cache + requireAuth guard
│   │   ├── authValidation.ts # signin/signup form validation
│   │   └── types.ts          # CanvasContent, AuthUser, UserSession, etc.
│   ├── theme/theme.ts        # MUI dark theme
│   ├── routes/               # File-based TanStack routes
│   │   ├── __root.tsx        # Root layout (ThemeProvider + Outlet + 404)
│   │   ├── index.tsx         # Public landing page
│   │   ├── signin.tsx / signup.tsx
│   │   ├── dashboard/        # Auth-guarded layout + workspace pages
│   │   └── canvas/$canvasId.tsx  # Full-screen canvas editor
│   ├── components/
│   │   ├── layouts/DashboardLayout.tsx  # Sidebar + TopBar shell
│   │   ├── Auth*.tsx         # Auth forms, modal, layout
│   │   ├── CanvasWorkspace.tsx / CanvasTile.tsx
│   │   ├── WorkspaceDashboard.tsx / WorkspaceView.tsx / WorkspaceTile.tsx
│   │   ├── Sidebar.tsx / TopBar.tsx / TileActions.tsx / NotFound.tsx
│   │   └── landing/          # Landing page sections
│   └── assets/               # hero.png, svgs
├── index.html
├── vite.config.ts            # /api proxy → localhost:3000
└── package.json
```

## Routing

Routes are declared as files under `src/routes/`; the `@tanstack/router-plugin` generates `routeTree.gen.ts` automatically (with code splitting).

| Path | Route file | Page |
| ---- | ---------- | ---- |
| `/` | `routes/index.tsx` | Marketing landing page (redirects to `/dashboard` if signed in) |
| `/signin`, `/signup` | `routes/signin.tsx`, `routes/signup.tsx` | Auth pages (auto-redirect if signed in) |
| `/dashboard` | `routes/dashboard/route.tsx` | Auth-guarded `DashboardLayout` (Sidebar + TopBar) |
| `/dashboard` | `routes/dashboard/index.tsx` | `WorkspaceDashboard` — list of workspaces |
| `/dashboard/workspaces/$workspaceId` | `routes/dashboard/workspaces/$workspaceId.tsx` | `WorkspaceView` — canvases in a workspace |
| `/canvas/$canvasId` | `routes/canvas/$canvasId.tsx` | `CanvasWorkspace` — full-screen Excalidraw editor |

## State management

Intentionally minimal — no Redux/Zustand/React Query/Context store.

- **Data fetching & UI state:** local `useState`/`useEffect` in each component.
- **Session:** a tiny module-level cache in `src/lib/auth.ts`. `getCurrentSession()` fetches `/api/auth/get-session` once and caches it; `clearSessionCache()` invalidates it after login/logout.
- **Auth guards:** TanStack Router `beforeLoad` hooks. `requireAuth()` throws `redirect({ to: "/" })` when there's no user, and is applied to the `/dashboard` layout and `/canvas/$canvasId`. The landing route does the reverse — redirecting signed-in users to `/dashboard`.

## API client

`src/lib/api.ts` is a small typed `request<T>()` wrapper around `fetch`:

- Relative URLs (e.g. `/api/workspaces`) — no hardcoded base URL.
- Sets `Content-Type: application/json` and `credentials: "include"` so the auth cookie is sent.
- Throws an `Error` with the server's `message`/`error` on non-OK responses.

Exposes three clients mirroring the backend routes:

| Client        | Calls                                                            |
| ------------- | ---------------------------------------------------------------- |
| `authApi`     | get-session, sign-in/up/out                                      |
| `workspaceApi`| list, get, create, rename, delete workspaces                     |
| `canvasApi`   | list by workspace, get, create, rename, save content, delete     |

### Dev proxy

`vite.config.ts` proxies `/api` → `http://localhost:3000` (`changeOrigin: true`) during development. In production the SPA and API share a Vercel deployment, so relative URLs work unchanged.

## Canvas editor

`components/CanvasWorkspace.tsx` (route `/canvas/$canvasId`):

1. Fetches the canvas via `canvasApi.getById`, parses the stored JSON into `{ elements, appState }`, and hydrates the Excalidraw editor.
2. On every change, **auto-saves after a 1.5s debounce** (`useRef` timer) via `canvasApi.updateContent()`.
3. Floating **Back** button navigates to the owning workspace; a **light/dark theme toggle** updates `appState.theme` and saves it.

## Pages

- **Landing (`/`)** — dark marketing site (`components/landing/`): sticky header, hero, an interactive `CanvasDemo` (local-only fake whiteboard where clicks spawn shapes), feature grid, workspaces section, pricing, CTA, footer. Auth modal opens for sign-in/up.
- **Auth** — email/password forms with client-side validation (`authValidation.ts`), sign-in/sign-up toggle, "remember me", password visibility toggles. Google/GitHub social buttons are disabled placeholders ("coming soon").
- **Dashboard (`/dashboard`)** — `DashboardLayout` with a responsive Sidebar (permanent drawer on desktop, hamburger + temporary drawer on mobile; only Dashboard is functional) and a TopBar with user avatar menu and Sign Out. `WorkspaceDashboard` shows workspace cards with canvas counts and a "New Workspace" dialog.
- **Workspace (`/dashboard/workspaces/:id`)** — `WorkspaceView` lists canvases as cards with a fake Excalidraw preview and object count (`content.elements.length`), plus a "New Canvas" dialog.
- **Delete flow** — `TileActions` provides a three-dot menu with a red Delete action and confirmation dialog for both workspaces and canvases.

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |

Requires the backend running on `localhost:3000` for `/api` calls (see [../backend/README.md](../backend/README.md)).
