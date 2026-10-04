# Phase 1 implementation specifications

Companion to `MODERNIZATION_GAMEPLAN.md` section 6, Phase 1. Written by the planner for the implementation agents (Claude Opus 5.5, medium effort). Each stream below is executed by its own agent in its own git worktree and branch. The planner merges, reviews and pushes.

## 0. Rules for every implementation agent

1. Work only inside the worktree directory and branch you were given. Never touch `docs/`, `README.md` or files outside your stream's directories unless the spec says so; the planner owns documentation.
2. Before you finish, these must pass in your worktree and you must paste their last lines in your report:
   - backend: `npm run typecheck`, `npm run lint` (once it exists), `npm test`
   - frontend: `npm run typecheck`, `npm run lint`, `npm test` (once it exists), `npm run build`
3. Add or extend tests for everything you change. A behaviour without a test is not done.
4. No secrets in the tree. `.env` files are gitignored; update `.env.example` files instead.
5. Keep the public API contract exactly as written in section 1 of this file. If the spec is wrong or impossible, stop at that item, keep everything else green, and report the problem instead of improvising a different contract.
6. Commit as you complete each numbered item, with a message that starts with the item id (for example `1.4 validation middleware: ...`). Do not push; the planner pushes.
7. Do not upgrade dependencies beyond what the spec names. Do not add dependencies the spec does not list without saying why in your report.
8. Prefer small, boring code. No new abstractions that only one call site uses.

## 1. Shared contracts (both streams implement against these)

### 1.1 Session cookie
- Cookie name `embrace_session`; value is the existing HS256 JWT (`{ userId }`), signed with `JWT_SECRET`, lifetime `JWT_EXPIRES_IN`.
- Attributes: `HttpOnly; Path=/; SameSite=Lax; Max-Age=<JWT_EXPIRES_IN in seconds>`; `Secure` when `NODE_ENV=production`.
- `POST /api/auth/login` sets the cookie and responds `200 { success: true, user }` with NO `token` field.
- `POST /api/auth/logout` clears the cookie and responds `204`.
- `GET /api/auth/me` responds `200 { success: true, user }` or `401`.
- `authenticate` middleware accepts, in this order: the cookie; then `Authorization: Bearer <jwt>` (kept for tests, scripts and future mobile clients). Both carry the same JWT.
- The browser talks to the API through a same-origin Next.js rewrite (`/api/:path*` on the frontend origin proxies to the backend), so the cookie is first-party and `SameSite=Lax` is sufficient. Cross-site browser calls are not supported. CORS stays restricted to `CORS_ORIGIN` for non-browser or direct-origin clients.
- Mutating requests must send `Content-Type: application/json`; the API rejects form-encoded bodies (Express only mounts `express.json`). This plus `SameSite=Lax` is the CSRF posture for Phase 1.

### 1.2 Error shape
- Every error response is `{ error: string, code?: string, details?: Record<string, string[]> }`.
- Status mapping: validation 400 (`code: "VALIDATION"` with `details` from zod), bad JSON 400, no/invalid session 401, insufficient role 403, missing resource 404, unique conflict 409, unknown 500 `{ error: "Internal server error", requestId }`.
- Success responses keep the current `{ success: true, ... }` envelope (Phase 2 may revisit).

### 1.3 Database
- Provider `postgresql`. Local URL `postgresql://church:church@localhost:5432/church_dev?schema=public`; tests use `church_test`. A `docker-compose.yml` at the repo root (Stream C adds it) runs `postgres:16-alpine` with those credentials for developers who do not have Postgres installed. In this planning container Postgres 16 is installed locally with the same credentials.
- Migration history is regenerated as a single baseline migration from the current schema (`prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`). The SQLite migrations are deleted. `migration_lock.toml` says `postgresql`.
- No data-model changes in Phase 1 beyond the provider switch (enums, relations, indexes are Phase 3). `String` columns that hold JSON stay `String` for now.
- Text search uses `mode: 'insensitive'`.

### 1.4 Environment variables
Backend (`backend/.env.example`): `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `LOG_LEVEL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `RATE_LIMIT_AUTH_MAX` (default 10), `RATE_LIMIT_AUTH_WINDOW_MINUTES` (default 15).
Frontend (`frontend/.env.example`): `API_URL` (server-side, used by the rewrite, default `http://localhost:5000`). No `NEXT_PUBLIC_API_URL` any more: the browser always calls the relative `/api`.

## 2. Stream A: backend (worktree branch `modernize/phase-1-backend`, directory `backend/` only)

### A1 (item 1.0) Postgres
- `schema.prisma`: `provider = "postgresql"`; keep `url = env("DATABASE_URL")`.
- Delete `prisma/migrations/*` and create the baseline migration folder `prisma/migrations/20261004000000_init_postgres/migration.sql` from `prisma migrate diff --from-empty --to-schema-datamodel`. Set `migration_lock.toml` to `provider = "postgresql"`.
- `.env.example`: new `DATABASE_URL`.
- Tests: `vitest.config.mts` env `DATABASE_URL=postgresql://church:church@localhost:5432/church_test?schema=public`; `test/global-setup.ts` resets the schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` via a throwaway `pg` or Prisma client) then runs `prisma migrate deploy`. Remove the SQLite file handling.
- `simple-media.ts` search and `users` list: `contains` with `mode: 'insensitive'`.
- Accept: `npx prisma migrate deploy` on an empty `church_dev` succeeds; `npm test` passes against `church_test`; `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://church:church@localhost:5432/church_test --exit-code` reports no drift.

### A2 (items 1.2, 1.3, 1.4, 1.5) structure, validation, errors, logging
- `tsconfig.json`: `target ES2022`, `lib ["ES2022"]`, `module NodeNext`, `moduleResolution NodeNext` (package stays CommonJS: no `"type": "module"`), `rootDir src`, `outDir dist`, `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `isolatedModules`, `skipLibCheck`, `include ["src", "test", "prisma", "vitest.config.mts"]`; `tsconfig.build.json` extends it with `include ["src"]` and `exclude` tests. Scripts: `dev: tsx watch src/server.ts`, `build: prisma generate && tsc -p tsconfig.build.json`, `start: node dist/server.js`, `typecheck: tsc --noEmit`, `lint: eslint .`, `test`, `db:*` as today. Add `eslint.config.mjs` with `typescript-eslint` recommended-type-checked (devDeps: `eslint@9`, `typescript-eslint`, `@eslint/js`, `globals`, `eslint-config-prettier`); fix what it flags; `: any` count in `src/` must reach zero (`memberAnalytics.ts` included).
- Module layout: `src/modules/<name>/{router.ts,service.ts,schemas.ts}` for `auth`, `users` (includes saved searches as `saved-searches.router.ts` inside `users` or its own module), `roles`, `media`, `analytics`, `member-details`. Routers only parse, authorize and call services; services hold Prisma queries and business logic (CSV generation, saved-search formatting, engagement calculations). Delete `src/routes/` when empty. `app.ts` mounts modules; `server.ts` unchanged in role.
- `src/middleware/validate.ts`: `validate({ body?, query?, params? })` using zod, replacing `parseOr400`; on failure respond per 1.2 with `code: "VALIDATION"`. Every route declares schemas: ids `z.string().cuid()`, `limit` and `offset` coerced ints with bounds (max 100), dates `z.coerce.date()`, enums for the stringly-typed fields the UI uses (`membershipStage`, `riskLevel`, `interactionType`, `channel`, `priority`, `category`, `impact`, `noteType`, media `type` limited to `YOUTUBE_VIDEO`), URLs via `z.url()` restricted to `https://` and YouTube hosts for media.
- `src/middleware/error-handler.ts`: maps `ZodError`, `Prisma.PrismaClientKnownRequestError` codes `P2025 -> 404`, `P2002 -> 409`, `P2003 -> 400`, JWT errors `-> 401`, `entity.parse.failed -> 400`, else 500 with a `requestId`. `src/middleware/not-found.ts`. `express.json({ limit: '100kb' })`.
- Logging: `pino` + `pino-http` with a per-request id (`req.id`), redaction of `authorization`, `cookie`, `password`; replace every `console.*` in `src/` (zero left); never log emails or tokens at info level. `LOG_LEVEL` from env; pretty output only when `NODE_ENV=development` (`pino-pretty` as a devDependency).
- `GET /health` also reports `uptime` and `version` from `package.json`.
- Accept: `npm run build && node dist/server.js` serves `/health`; `grep -rn "console\." src` is empty; `npm run lint` clean; all tests pass; malformed input on every mutating route yields a 400 with `details` (add a parameterised test).

### A3 (items 1.6, 1.7) authentication hardening and cookie sessions
- Rate limiting with `express-rate-limit@8`: `/api/auth/login` and `/api/auth/register` limited per IP to `RATE_LIMIT_AUTH_MAX` per `RATE_LIMIT_AUTH_WINDOW_MINUTES`, response 429 `{ error, code: "RATE_LIMITED" }`; `standardHeaders: 'draft-8'`; disabled when `NODE_ENV=test` unless the test opts in via `RATE_LIMIT_AUTH_MAX`.
- Password policy: min 12, max 128, must not equal the email local part, must not be in a short built-in list of the most common passwords (ship a 1000-entry list as a TS array). Applies to register, staff create and password changes.
- `POST /api/auth/change-password` `{ currentPassword, newPassword }` for the signed-in user; `POST /api/users/:id/reset-password` `{ newPassword }` admin only. Both invalidate nothing server-side (stateless JWT) but respond 200 and the frontend re-logs in.
- Cookie session per 1.1: `cookie-parser` (or manual parsing) in `authenticate`; `login` sets the cookie and omits `token`; `logout` clears it; keep bearer support.
- `register` and `login` must return identical generic errors for unknown email versus wrong password, and `register` for an existing email returns the same 201 shape as a successful registration (`pendingApproval: true`) without creating a duplicate, so email enumeration is not possible. Update the existing tests accordingly.
- Accept: tests for 429 after N attempts (opt-in max of 3), password policy rejections, change-password happy path and wrong current password, cookie set on login (`Set-Cookie` with `HttpOnly`, `SameSite=Lax`), `/me` works with the cookie alone, logout clears it, bearer still works.

### A4 (item 1.13 backend part) tests
- Expand to cover every module's happy path and every 401/403 boundary; keep tests independent (fresh schema per run, unique emails per file). Target: every route in `app.ts` appears in at least one test. Report the route-to-test mapping in your summary.

## 3. Stream B: frontend (worktree branch `modernize/phase-1-frontend`, directory `frontend/` only)

### B1 (items 1.9, 1.10) API client and types
- `next.config.ts`: `async rewrites()` returning `{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:5000'}/api/:path*` }`. `frontend/.env.example` with `API_URL`. Allow `!.env.example` in `frontend/.gitignore`.
- `src/lib/api/client.ts`: `apiFetch<T>(path: string, init?: RequestInit & { json?: unknown })` that calls the relative `/api${path}` with `credentials: 'include'`, sets `Content-Type: application/json` only when a body is present, parses JSON, throws `ApiError { status, code?, message, details? }` on `!response.ok`, and on 401 dispatches a `window` event `embrace:unauthenticated` that the AuthProvider listens to. Never touches `localStorage`. Export `isApiError`.
- Endpoint modules `src/lib/api/{auth,users,roles,media,analytics,memberDetails,savedSearches}.ts` with typed functions for every call the UI makes today (`login`, `logout`, `me`, `register`, `listUsers`, `getUser`, `createUser`, `updateUser`, `exportUsers`, `listRoles`, `listMedia`, `createMedia`, `getMemberDetails`, `getAnalytics`, `refreshAllEngagement`, `listSavedSearches`, `createSavedSearch`, `deleteSavedSearch`, `useSavedSearch`). All components call these; `grep -rn "localhost:5000\|fetchWithAuth\|localStorage" src` must be empty. Delete `src/lib/auth.ts`.
- `src/types/domain.ts` stays the single source of types; extend it for anything the endpoint modules need (for example `MemberDetails`, `MemberAnalytics`, `ApiEnvelope<T>`). Zero `any` (already enforced by lint).

### B2 (items 1.11 and the client half of 1.7) auth provider and route protection
- `src/lib/auth/AuthProvider.tsx` exposing `{ user, status: 'loading' | 'authenticated' | 'anonymous', login(email, password), logout(), refresh() }` via `useAuth()`; `useHasRole(...names)`; `useIsStaff()`. Mount in `src/app/providers.tsx` from `layout.tsx`. On mount it calls `me()`; on `embrace:unauthenticated` it sets `anonymous` and routes to `/login`.
- Routes: `src/app/login/page.tsx` and `src/app/register/page.tsx` host the existing forms; `src/app/page.tsx` becomes the authenticated shell (it keeps the current view toggles; Phase 2 splits them). `src/middleware.ts` redirects requests without the `embrace_session` cookie to `/login?next=<path>` for every path except `/login`, `/register`, `/_next/*`, `/api/*`, static assets; and redirects `/login` to `/` when the cookie is present. Presence of the cookie is only a UX hint; the API is the authority.
- Role gating in the UI with `useIsStaff()`: hide `Add Member`, `Edit`, `View` (profile), `Export`, the analytics quick action, `Add Video`, and the saved-search save form for non-staff. Members see the directory (name, avatar, roles) and their own profile card.
- Logout calls `POST /api/auth/logout` then routes to `/login`.
- Accept: visiting `/` without the cookie redirects to `/login`; after login the dashboard renders; a `member` sees no staff controls; `npm run build` clean.

### B3 (item 1.12) make the UI honest
- Replace Tailwind v3-only utilities: `bg-opacity-*` and `bg-black bg-opacity-N` -> `bg-black/N`, `bg-gray-600 bg-opacity-50` -> `bg-gray-600/50`, `flex-shrink-0` -> `shrink-0`; grep for `text-opacity-`, `border-opacity-`, `ring-opacity-`, `flex-grow` too.
- VideoPlayer: add `onSelect(index: number)` prop; playlist items are `<button>`s that call it; `page.tsx` wires it to `setCurrentMediaIndex` and `setPlayingMedia`.
- Remove the five no-op bulk actions and the Excel export button (keep CSV); remove the `Upcoming Events` and `Slack Workspace` placeholders and the hard-coded `Membership Overview` card text (replace with real counts from the member list or remove the card). Hide the Advanced Search button and the predefined saved searches until the evaluator exists (Phase 2): keep the components in the tree but unreachable, with a one-line comment pointing to the gameplan item.
- Fix the Excel-named download: CSV only, filename from `Content-Disposition`, error toast on failure.
- Accept: no visible button does nothing; thumbnails and modal backdrops render correctly; `npm run build` clean.

### B4 (item 1.13 frontend part) tests
- `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` (devDeps), `vitest.config.mts` with `environment: 'jsdom'`, `src/test/setup.ts`. Tests: `apiFetch` (mock `fetch`: JSON body, 401 event, ApiError shape), `AuthProvider` (loading -> authenticated -> logout), `MemberList` (renders rows, sorting by name does not throw, filters reduce rows, staff-only controls hidden for members), `AddEditMemberModal` (create payload includes `roleIds` and `isActive`; update sends `roleIds` only when changed), `RegisterForm` (shows the pending message). Script `test: vitest run`.

## 4. Stream C: repository, CI, containers (branch `modernize/phase-1-repo`, runs after A and B are merged)

### C1 (item 1.1) workspaces and tooling
- Root `package.json` (`private`, `workspaces: ["backend", "frontend"]`, `engines.node >=22.12`) with scripts `dev` (runs both with `concurrently`), `build`, `lint`, `typecheck`, `test`, `format`, `format:check`; a single root `package-lock.json` (delete the two package lockfiles). `tsconfig.base.json` with the shared strict options; both packages `extends` it.
- `prettier` (root `.prettierrc`: 2 spaces, single quotes, trailing commas, printWidth 100), `.editorconfig`, `husky` + `lint-staged` running prettier and eslint on staged files. Format the tree once in its own commit.
- Remove `.claude/settings.local.json` from git (`git rm --cached`) and add `.claude/settings.local.json` to `.gitignore`; keep the file on disk.
- Clean the root `.gitignore` to what the repo actually needs.

### C2 (item 1.14) CI and containers
- `.github/workflows/ci.yml`: on push and pull request; `actions/setup-node` with `node-version-file: .nvmrc` and npm cache; `npm ci` at root; job `backend` with a `postgres:16-alpine` service (`church`/`church`/`church_test`) running `npm run -w backend typecheck`, `lint`, `test`, `build`, and `npx -w backend prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ... --exit-code`; job `frontend` running `typecheck`, `lint`, `test`, `build`; job `e2e` (Playwright smoke, see C3) that needs both.
- `.github/dependabot.yml` for npm (weekly, grouped minor/patch) and github-actions.
- `backend/Dockerfile` multi-stage (`node:22-alpine`): install, `prisma generate`, `tsc`, then a runtime stage with `dist`, `node_modules` pruned to production plus the Prisma CLI for `migrate deploy`, entrypoint `sh -c "npx prisma migrate deploy && node dist/server.js"`. `frontend/Dockerfile` with `output: 'standalone'`. Root `docker-compose.yml`: `db` (postgres:16-alpine with the 1.3 credentials and a volume), `api`, `web` with `API_URL=http://api:5000`. `.dockerignore` files.
- Accept: `docker compose config` validates; the CI workflow file passes `actionlint` if available; otherwise a careful read.

### C3 Playwright smoke
- `@playwright/test` in `frontend/` (uses the preinstalled Chromium in this container via `executablePath` when `PLAYWRIGHT_BROWSERS_PATH` is set). One spec: seed an admin via `npm run -w backend db:seed` with env credentials, log in through the UI, open Members, open a profile, open Media, log out. Runs locally against `npm run dev` of both apps and in CI against the compose stack or dev servers. Script `test:e2e`.

## 5. Merge order and verification by the planner
1. Merge A and B into `modernize/phase-1` (they touch disjoint directories; conflicts are not expected).
2. Run the full check set in both packages against local Postgres.
3. Launch C on the merged result; merge; run everything again, including the Playwright smoke.
4. Adversarial review of the full Phase 1 diff, fix, then push and report.
