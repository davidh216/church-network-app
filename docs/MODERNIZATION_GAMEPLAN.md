# Church Network App: Modernization Gameplan

Date: 2026-10-03. Status: APPROVED 2026-10-04 (initial scope = Phase 0 + Phase 1). Phase 0 implemented on branch `modernize/phase-0`.

Owner decisions (2026-10-04): D1 Postgres, moved up to the start of Phase 1 (switching the Prisma provider regenerates the migration history, so it follows the Phase 0 security fixes rather than preceding them). D2 registration requires admin approval. D3 httpOnly cookie sessions. D6 delete the lifecycle-automation tables. Remaining decisions take the recommendation unless the owner says otherwise.

## 1. Executive summary

Embrace is a church-management app: an Express 5 + Prisma + SQLite API in `backend/` and a Next.js 15 App Router + React 19 + Tailwind 4 UI in `frontend/`. Four commits, all from 2025-08-02, built a lot of surface area quickly: 19 Prisma models, 32 API routes, 12 UI components, and a README that promises more than the code delivers.

As committed, neither package builds and the backend does not start. The API has no authorization layer at all: anyone can self-register and immediately read every member's password hash, address, pastoral notes and prayer requests, export the whole congregation, and write CRM records about other people. The JWT secret and an admin password are in git. The member list cannot show the engagement data it was designed around and crashes when sorted.

The review produced 132 unique findings (7 critical, 34 high, 49 medium, 42 low). The **initial scope** is Phase 0 (make it build, run and stop the data exposure) plus Phase 1 (foundations: config, authorization, validation, API client, tests, CI). Everything else is sequenced behind it. Rough effort for the initial scope is 10 to 13 working days for one developer working with Claude Code; the full plan is roughly 6 to 8 weeks.

## 2. Current state, verified

Checked in a clean container on 2026-10-03 (Node 22.22.0, npm 10.9.4). Full notes are in the review's facts file; the parts that drive the plan:

| Check | Backend | Frontend |
|---|---|---|
| `npm install` | OK | OK, npm warns next 15.4.5 is vulnerable (CVE-2025-66478) |
| `tsc --noEmit` | FAIL: `src/routes/member-details.ts(311,23)` Property 'user' does not exist on type Request | FAIL: `src/app/page.tsx(301,34)` any[] not assignable to never[] |
| Lint | No lint configured | FAIL: 23 errors, 23 warnings (17 no-explicit-any, 3 conditional hooks in VideoPlayer, 3 unescaped entities) |
| Build / start | `npm run dev` and `npm start` CRASH at boot with the TSError above (ts-node type-checks) | `next build` FAIL, blocked by the lint errors |
| Boots with type-check off | Yes (`ts-node --transpile-only`); `/health` 200, protected routes 401 without a token | n/a |
| Prisma | `validate` OK, 6 migrations apply cleanly, zero drift between migrations and schema | n/a |
| `npm audit --omit=dev` | 3 high (prisma range) | 1 critical, 2 high (next, sharp) |
| Tests | None | None |

Dependency currency (installed range, current upstream, recommended target for this plan):

| Package | Installed | Upstream | Target | Note |
|---|---|---|---|---|
| next | 15.4.5 | 16.3.8 | 15.5.x in Phase 0, 16.x in Phase 4 | 16 removes `next lint`, has breaking changes; patch first |
| react / react-dom | 19.1.0 | 19.3.0 | 19.3 in Phase 4 | low risk |
| typescript | ^5.8 / ^5 | 7.0.2 | 5.9.x | 7.x is the native compiler; wait for ecosystem |
| tailwindcss | ^4 | 4.3.3 | 4.3 | already v4; fix removed v3 utilities (F032) |
| eslint / eslint-config-next | ^9 / 15.4.5 | 10.12 / 16.3.8 | 9.x flat config now, 10 with Next 16 | |
| prisma / @prisma/client | ^6.13 | 7.10 (8 rc) | 6.19 in Phase 0, 7.x in Phase 4 | 7 changes generator and config |
| express | ^5.1 | 5.2.1 | 5.2 | |
| dotenv | ^17.2 | 18.0.5 | drop in favour of `node --env-file` or keep 18 | never imported today |
| helmet / morgan | declared | 8.3 / 1.12 | helmet 8 (use it), replace morgan with pino-http | never imported today |
| New: zod 4.6, vitest 5, @testing-library/react 16, supertest 7, @playwright/test 1.63, tsx 4.23, pino 10, @tanstack/react-query 5 | | | | |

## 3. Findings summary

Counts: 7 critical, 34 high, 49 medium, 42 low (132 total, deduplicated from 209 raw findings across eight review dimensions).

Verification status, stated plainly: the automated adversarial verification pass failed on a usage limit before it could run. I manually verified all 7 critical findings and spot-checked F032 through F038 and F069 against the code; all held. The toolchain facts in section 2 were produced by running the commands. Medium and low findings are line-cited but individually unverified; treat them as strong leads to confirm when the phase that touches them starts.

### Critical and high findings

| Id | Sev | Finding | Location | Fixed in |
|---|---|---|---|---|
| F001 | critical | Admin password `password123`, JWT secret and a signed token committed in debug scripts | backend/create-test-user.js:11, debug-auth.js:5 | P0 |
| F002 | critical | GET /api/member-details/:id returns password hash and every sensitive column to any member | backend/src/routes/member-details.ts:12 | P0 |
| F003 | critical | Pastoral notes, prayer requests (incl. isPrivate) and interactions readable by any member | member-details.ts:214 | P0 |
| F004 | critical | All config hardcoded (JWT secret, port, DB URL, open CORS); dotenv never loaded | backend/src/server.ts:14 | P0 |
| F005 | critical | Open self-registration plus zero role checks exposes all CRM reads and writes to anyone | server.ts:98 | P0 |
| F006 | critical | MemberList reads engagement fields that /api/users never returns; /api/users/enhanced is dead | frontend MemberList.tsx:66 | P0 |
| F007 | critical | MemberList crashes on sort or advanced search: helpers used in render before their `const` (TDZ) | MemberList.tsx:124 | P0 |
| F008 | high | package-lock.json gitignored; no lockfile ever committed | .gitignore:67 | P0 |
| F009 | high | No root package.json or workspaces; two diverging toolchains | backend/package.json:1 | P1 |
| F010 | high | dev and start both run ts-node on source; no build output | backend/package.json:7 | P1 |
| F011 | high | tsconfig is `tsc --init` boilerplate (es2016, no outDir/include) | backend/tsconfig.json:14 | P1 |
| F012 | high | Five PrismaClient instances, one created per request and never disconnected | routes/analytics.ts:106 | P0 |
| F013 | high | Any member can write notes, interactions and milestones about any other member | member-details.ts:244 | P0 |
| F014 | high | No request validation layer anywhere | member-details.ts:247 | P1 |
| F015 | high | `req.user` on un-augmented Request; 32 `any` annotations cover every handler | member-details.ts:311 | P0 (type), P1 (rest) |
| F016 | high | Monolithic server.ts: config, middleware, seeding, 17 handlers, listen | server.ts:11 | P1 |
| F017 | high | Role seeding runs twice at startup with two incompatible permission formats | server.ts:17 | P0 |
| F018 | high | No central error middleware or 404 handler; 36 hand-rolled try/catch | server.ts:38 | P1 |
| F019 | high | No password policy, no change or reset path | server.ts:103 | P1 |
| F020 | high | No rate limiting or lockout on login/register | server.ts:155 | P1 |
| F021 | high | Directory and analytics endpoints expose emails, phones, lastLoginAt, giving/risk scores to all members | server.ts:257 | P0 |
| F022 | high | Whole-congregation CSV export available to any member | server.ts:303 | P0 |
| F023 | high | No tests, test runner, or lint in backend; no tests in frontend | | P1 |
| F024 | high | Engagement scores inflatable by any member via unvalidated points | analytics.ts:58 | P0 |
| F025 | high | Attendance denominator is fabricated; no Service table exists | memberAnalytics.ts:356 | P3 |
| F026 | high | membershipStage and riskLevel are free strings; UI offers stages the service never assigns | schema.prisma:268 | P3 |
| F027 | high | No CI, Dockerfile, compose or dependency automation | | P1 |
| F028 | high | One route toggles four views with booleans instead of App Router segments | frontend page.tsx:16 | P2 |
| F029 | high | No auth provider; user state lives in page.tsx | page.tsx:14 | P1 |
| F030 | high | No route protection or role gating; admin actions render for every user | page.tsx:62 | P1 |
| F031 | high | Lint not enforced, deprecated `next lint`, existing errors block build | VideoPlayer.tsx:46 | P0 |
| F032 | high | Tailwind v3-only utilities (bg-opacity-*, flex-shrink-0) render thumbnails as solid black boxes and backdrops opaque | SimpleMediaLibrary.tsx:214 | P1 |
| F033 | high | Media search loses focus every keystroke and refetches without debounce | SimpleMediaLibrary.tsx:65 | P2 |
| F034 | high | Playlist items only console.log; selecting one does nothing | VideoPlayer.tsx:365 | P1 (hide or wire) |
| F035 | high | 'Add Member' POSTs to public /api/auth/register and drops roles, bio, isActive | AddEditMemberModal.tsx:121 | P1 |
| F036 | high | Five bulk actions are no-ops with no backend routes | BulkActionsToolbar.tsx:21 | P1 (hide), P5 (build) |
| F037 | high | 'Export Excel' downloads a JSON blob named members.excel | MemberList.tsx:221 | P1 |
| F038 | high | evaluateAdvancedQuery is a stub returning true; advanced and saved searches show everyone | MemberList.tsx:152 | P1 (hide), P2 (implement) |
| F039 | high | Domain types duplicated and untyped across the frontend; no shared contract | MemberProfile.tsx:6 | P1 |
| F040 | high | API base URL hardcoded to localhost:5000 in 14 places | lib/auth.ts:1 | P1 |
| F041 | high | No typed fetch wrapper; callers re-parse `{success}` nine times, 401 ignored | lib/auth.ts:122 | P1 |

### Medium and low findings by theme

| Theme | Ids | Fixed in |
|---|---|---|
| Repo hygiene, gitignore, metadata, Node pin, formatting, hooks | F042 F043 F045 F046 F101 F102 F110 F111 F112 F113 F114 F115 F116 F120 | P0/P1 |
| Hardening: helmet, open CORS, logging of PII, token design, health check | F044 F067 F068 F069 F091 F093 | P1 |
| Dependency currency | F047 F090 F117 F118 F119 | P0 patch, P4 majors |
| Data model: enums, bare id columns, indexes, name fields, family, JSON columns, cascade, dead tables | F048 F049 F050 F051 F052 F053 F054 F055 F056 F057 F058 F061 F062 F066 F092 F099 F104 F105 F106 F107 F108 F109 | P3 (P4 for Postgres) |
| Analytics correctness and cost | F059 F063 F064 F065 F100 | P3 |
| Backend API correctness | F060 F070 F071 F072 F073 F094 F095 F096 F097 F098 F103 | P1/P3 |
| Frontend architecture: client-only rendering, data fetching, layout, resilience, oversized components, misplaced route, config, alias | F074 F075 F076 F077 F078 F079 F080 F123 F124 F125 | P2 |
| Frontend correctness: edit member fields, media cap, pagination reset, select-all, date filter, stale closure, error states | F081 F084 F086 F127 F128 F129 F130 F131 F132 | P2 |
| Accessibility and keyboard | F082 F083 F087 F089 | P2 |
| Security hardening in UI: embed URL validation | F088 | P1 |
| Feature gaps already visible in UI: saved searches, dead placeholders, theming | F085 F121 F122 F126 | P2 |

## 4. What the product actually is today

Working end to end: register and log in with a JWT; a member list with client-side quick filters, table and card views and CSV export; a read-only member profile modal; a YouTube-link media library with search, tag filter, grid and list views and an iframe player; an engagement analytics modal with a "refresh all" button.

Partially working: member profile editing (cannot clear fields or change roles), saved searches (saved but not applied), the player playlist (prev/next only), add member (goes through public registration).

Schema only or dead buttons: groups and ministries, attendance, family relationships UI, lifecycle automation, member tags, bulk actions, communication tools, media approval workflow, "Upcoming Events", "Slack Workspace", role-based permissions. The README claims WCAG compliance, Helmet and "full type safety"; none is present. Of 32 backend routes, 17 are never called by the UI. Appendix B has the full matrix and Appendix C the contract audit.

## 5. Target architecture

Repository layout (npm workspaces, single lockfile at root):

```
church-network-app/
  package.json            workspaces: backend, frontend; root scripts: dev, build, lint, typecheck, test, format
  tsconfig.base.json      strict, ES2022, shared compiler options
  .nvmrc                  22
  .github/workflows/ci.yml
  backend/
    src/app.ts            builds the Express app, no side effects (testable)
    src/server.ts         listen, graceful shutdown, prisma disconnect
    src/config/env.ts     zod-validated process.env, fails fast
    src/lib/prisma.ts     one PrismaClient, password omitted by default
    src/lib/logger.ts     pino
    src/middleware/       authenticate, requireRole, validate(zod), errorHandler, notFound, rateLimit
    src/modules/<name>/   router.ts, service.ts, schemas.ts per domain: auth, users, saved-searches, roles, media, analytics, member-details
    src/types/express.d.ts   Request.user augmentation
    prisma/seed.ts        idempotent roles and dev admin from env
    test/                 vitest + supertest against app.ts on a throwaway SQLite file
    Dockerfile            multi-stage node:22-alpine
  frontend/
    src/app/(auth)/login, register
    src/app/(app)/layout.tsx          shell, session check, nav
    src/app/(app)/page.tsx            dashboard
    src/app/(app)/members, members/[id], media, analytics
    src/app/providers.tsx             AuthProvider, QueryClientProvider
    src/lib/api/client.ts             apiFetch<T>, API_BASE from NEXT_PUBLIC_API_URL, ApiError, 401 handling
    src/lib/api/<domain>.ts           typed endpoint functions
    src/types/domain.ts               shared domain types (moved to packages/shared with zod schemas in Phase 2)
    src/components/<domain>/          components under ~300 lines, server components where no interactivity is needed
    test/                             vitest + testing-library; e2e/ Playwright smoke
```

Authentication and authorization: keep JWT, but move it to an httpOnly, SameSite cookie set by the API (decision D3) with Next.js rewrites proxying `/api` to the backend so the browser never sees a token. Roles come from the existing `UserRole` rows; `requireRole('admin','leader')` guards every CRM, analytics, export and write route; `member` gets a reduced directory projection. Registration creates `isActive: false` accounts until an admin approves them (decision D2).

Data: stay on SQLite through Phase 3 with the schema tightened (enums, real relations, indexes), then move to Postgres in Phase 4 once tests cover the API. Prisma stays the ORM.

Testing pyramid: backend route tests with supertest (auth, authz denials, each module's happy path); frontend component tests for the member list, forms and API client; one Playwright smoke (login, open members, open a profile, open media). CI runs lint, typecheck, test, build and `prisma migrate diff --exit-code` on every PR.

## 6. The plan

**Initial scope = Phase 0 + Phase 1.** Definition: the smallest set of changes after which the app builds, starts, no longer leaks or lets members tamper with other members' data, and has the configuration, authorization, validation, API client, test and CI foundations that make every later change safe to ship. It deliberately excludes restructuring the UI into routes, data-model redesign, dependency majors and any new feature.

### Phase 0: make it build, run, and stop the data exposure (about 2 to 3 days)

Goal: a green `tsc`, `lint` and `build` in both packages, a backend that starts from `npm run dev`, no secrets or default credentials in git, and no CRM data reachable by a plain member or an anonymous visitor.

- [x] 0.1 (S) Add `src/types/express.d.ts` augmenting `Request.user`; remove the `any` casts on `req` in handlers. Fixes the boot crash. F015. Accept: `npx tsc --noEmit` passes in backend, `npm run dev` serves `/health`.
- [x] 0.2 (S) Fix the frontend type error and the 23 lint errors (move VideoPlayer's early return below its hooks, type `mediaPlaylist`, replace `any` with domain types, escape entities). F031, F007 partly. Accept: `tsc --noEmit`, `eslint . --max-warnings 0` and `next build` pass.
- [x] 0.3 (S) Hoist MemberList's pure helpers above their use (or to module scope) and memoize filtered/sorted/paginated lists. F007. Accept: sorting a column and loading a saved search no longer throw; covered by a component test in Phase 1.
- [x] 0.4 (M) `src/config/env.ts` with zod: PORT, DATABASE_URL, JWT_SECRET (min 32), JWT_EXPIRES_IN, CORS_ORIGIN, NODE_ENV, LOG_LEVEL; `url = env("DATABASE_URL")` in schema.prisma; `backend/.env.example`; restrict CORS to CORS_ORIGIN; rotate the secret. F004, F067. Accept: server refuses to start without JWT_SECRET; no literal secret in `src/`.
- [x] 0.5 (S) Delete the five debug scripts; create `prisma/seed.ts` with idempotent role upserts (one permission format) and a dev admin from SEED_ADMIN_EMAIL/PASSWORD; remove both seeding blocks from server.ts; wire `prisma.seed`. F001, F017. Accept: `npx prisma db seed` is idempotent; `git grep password123 -- ':!docs'` returns nothing.
- [x] 0.6 (S) `src/lib/prisma.ts` singleton with `omit: { user: { password: true } }`; replace all five instantiations and the in-handler `require`. F012, F002 (hash exposure). Accept: `grep -r "new PrismaClient" src` returns one hit; `/api/member-details/:id` response has no `password` key (test).
- [x] 0.7 (M) `requireRole` middleware; apply `admin|leader` to all of member-details, analytics, `/api/users/export`, `/api/users/enhanced`, saved-search writes stay owner-scoped; filter `isPrivate` notes to author or admin; reduce `/api/users` to id/name/avatar/roles for `member`; registration creates `isActive: false` until approved (or invite code, decision D2). F002, F003, F005, F013, F021, F022, F024. Accept: supertest cases prove a `member` token gets 403 on each gated route and an anonymous request 401.
- [x] 0.8 (S) Commit lockfiles and `migration_lock.toml` (remove the ignore rules), add `.nvmrc`, `engines`, fix package.json metadata. F008, F042, F045, F046. Accept: `npm ci` works in both packages from a clean clone.
- [x] 0.9 (S) Patch dependencies within majors: next 15.5.x, prisma 6.19, react 19.3 if 15.5 allows; run audit. F090 (patch), F047 (patch), F118. Accept: `npm audit --omit=dev` reports no high or critical.

Exit criteria: all nine acceptance checks pass; a manual run shows a newly registered user cannot open any member profile; PR merged to `main`.

Verified 2026-10-04 on `modernize/phase-0` (after the adversarial review below): backend `tsc --noEmit` clean, 42 vitest + supertest tests green (register is inactive, member gets 403 on CRM/analytics/export/writes, every gated route returns 401 anonymously, leader sees no other author's private notes, no `password` or staff `notes` key in any response, CSV escaping and full header on empty exports, non-admins cannot grant staff roles or modify staff accounts, admins cannot lock themselves out, 413 on oversized bodies, 400 on non-cuid ids, approval flow); `npm run start` boots, `/health` 200, admin login works; frontend `tsc` clean, `eslint . --max-warnings 0` clean, `next build` succeeds; `npm audit --omit=dev` reports 0 vulnerabilities in both packages (npm overrides: `deepmerge-ts ^8` for the Prisma CLI config loader, `postcss ^8.5.23` inside Next; both verified against generate, migrate diff, tests and a CSS-producing build). Folded in from later phases because they were small or needed for the flow: staff-only `POST /api/users` and `PUT /api/users/:id` with `isActive` (staff) and `roleIds` (admin) and clearable phone/bio (1.8, now complete), helmet, JSON 404, body-parser-aware error handler (part of 1.5), `tsx` scripts (1.2 start), app/server split (1.3 start), fonts and metadata in layout, Excel button removed, advanced search hidden (1.12 parts), misplaced route file deleted (F079), CSV escaping (F072), health checks the database (F093), `lastLoginAt` on login (F096), a data migration lowercasing stored emails, MIT license file matching the README.

Adversarial review of the Phase 0 diff (36 agents: 3 reviewers, 33 verifiers): 29 confirmed findings, 4 refuted, all 29 fixed in commits e60b5fa through 6bc01db. The one authorization gap the review caught in new code was a leader being able to edit or deactivate admin accounts; it is closed and tested.

### Phase 1: foundations (about 8 to 10 days)

Goal: a modular, validated, observable backend; a typed frontend API layer with real auth state; tests and CI that gate every PR; the UI made honest about what works.

Backend
- [ ] 1.0 (M) Postgres (decision D1): `provider = "postgresql"`, regenerate a baseline migration from the current schema, `DATABASE_URL` pointing at a local Postgres (compose service or embedded binary for dev and CI), `mode: insensitive` for searches, Json and String[] columns where the schema used JSON strings. F048, F049, F099. Accept: migrations apply on a fresh Postgres; the Phase 0 test suite passes against it.
- [ ] 1.1 (M) Root `package.json` with workspaces and scripts, `tsconfig.base.json`, hoisted dev tooling; Prettier and EditorConfig; husky + lint-staged. F009, F113, F114, F043 (move settings.local.json out of git). Accept: `npm run lint typecheck test build` from the root runs both packages.
- [ ] 1.2 (S) Backend scripts: `dev: tsx watch`, `build: prisma generate && tsc -p tsconfig.build.json`, `start: node dist/server.js`; rewrite tsconfig (ES2022, NodeNext or commonjs, rootDir/outDir/include, strict extras). F010, F011, F115, F116. Accept: `npm run build && npm start` serves `/health` from `dist/`.
- [ ] 1.3 (L) Split server.ts into `app.ts` + `server.ts` + modules (auth, users, saved-searches, roles, media, analytics, member-details) with router/service/schemas files; move CSV export and saved-search formatting into services. F016, F071, F073, F094. Accept: `server.ts` under 40 lines; every route reachable via the module routers; behaviour unchanged (route tests).
- [ ] 1.4 (M) `validate({ body, query, params })` middleware with zod schemas per route (cuid ids, bounded limit/offset, enums, email, password length, URL scheme allowlist for media). F014, F060, F062, F088 (server side). Accept: malformed input returns 400 with field errors in tests.
- [ ] 1.5 (M) `errorHandler` (ZodError 400, P2025 404, P2002 409, JWT 401, else 500 with request id), JSON `notFound`, `express.json({ limit })`, pino + pino-http replacing 46 console calls, no PII in logs, helmet. F018, F044, F068, F093 (health checks DB). Accept: no `console.` in `src/`; unknown route returns JSON 404; `/health` fails when the DB is unreachable.
- [ ] 1.6 (M) Auth hardening: express-rate-limit on `/api/auth/*`, password policy (min 12), `POST /api/auth/change-password`, admin reset, write `lastLoginAt` on login, case-insensitive email uniqueness, generic registration error. F019, F020, F091, F092, F096. Accept: 11th login attempt in 15 minutes gets 429 (test).
- [ ] 1.7 (M) Session transport per decision D3: httpOnly SameSite cookie issued by the API, Next.js rewrite of `/api/*` to the backend, token no longer in localStorage. F069. Accept: `localStorage` not referenced in frontend; refresh keeps the session.
- [x] 1.8 (S) Staff-only `POST /api/users` (roles other than `member` require admin) and `PUT /api/users/:id` accepting roles (admin), isActive (staff) and clearable fields; `/api/users` includes engagement, membershipDate, lastLoginAt for admin/leader and `/users/enhanced` is removed. F006, F035, F070, F081. Done in Phase 0.

Frontend
- [ ] 1.9 (M) `lib/api/client.ts` (`apiFetch<T>`, `NEXT_PUBLIC_API_URL`, `ApiError`, 401 to login) and typed endpoint modules; replace all 14 hardcoded URLs; `frontend/.env.example`. F040, F041, F111. Accept: `grep -r localhost:5000 src` returns nothing; every call site uses a typed function.
- [ ] 1.10 (M) `types/domain.ts` as the single source of frontend types; `no-explicit-any` as an error; typed `useState`, callbacks and `catch (err: unknown)`. F039. Accept: zero `any` in `src/`.
- [ ] 1.11 (M) `AuthProvider` with `useAuth()`, `middleware.ts` redirecting unauthenticated users, `useHasRole()` hiding admin-only actions. F029, F030. Accept: visiting `/` logged out redirects to `/login`; a `member` sees no Add/Edit/Export controls.
- [ ] 1.12 (M) Make the UI honest: replace removed Tailwind v3 utilities with v4 syntax, wire playlist selection, hide bulk actions and Excel export behind a feature flag with a "coming soon" state, hide advanced search until implemented, remove the Events and Slack placeholders, fix the duplicate metadata and unused fonts, delete the misplaced `components/members/page.tsx`. F032, F034, F036, F037, F038 (hide), F077, F079, F126. Accept: no button in the app does nothing; thumbnails render; `next build` clean.

Quality gates
- [ ] 1.13 (L) Tests: backend vitest + supertest on `app.ts` with a per-run SQLite file and `prisma migrate deploy` in setup (auth flow, every 401/403, users, media, member-details); frontend vitest + testing-library (MemberList sort/filter, AddEditMemberModal, api client); one Playwright smoke. F023, F007 regression. Accept: `npm test` green; coverage reported; smoke runs headless in CI.
- [ ] 1.14 (M) `.github/workflows/ci.yml` (setup-node from `.nvmrc`, `npm ci`, lint, typecheck, test, build, `prisma migrate diff --exit-code`, Playwright), dependabot, multi-stage Dockerfiles and a compose file for local run. F027, F103. Accept: CI green on the PR; `docker compose up` serves both apps.

Exit criteria: all Phase 1 acceptance checks pass; CI required on `main`; README's "Getting Started" updated to the new scripts and env files; a fresh clone goes from `npm ci` to a running app in under five minutes.

Risks: 1.3 is the largest change and must be done behind the route tests from 1.13 (write the tests against the current routes first, then refactor); the cookie session (1.7) requires the frontend and API on the same site or a proxy, which the Next rewrite provides; moving `settings.local.json` changes the owner's Claude permissions.

### Phase 2: frontend structure and feature truth (about 8 to 10 days)

Goal: a navigable App Router application whose promised features work.

- [ ] 2.1 (L) Routes and layouts: `(auth)` and `(app)` groups, `/members`, `/members/[id]`, `/media`, `/analytics`; `loading.tsx`, `error.tsx`, `not-found.tsx`; server components for shells and read-only views. F028, F074, F075, F078, F123, F124.
- [ ] 2.2 (M) Server state with TanStack Query; remove `refreshTrigger`; debounce and cancel media search; reset pagination on filter change; fix select-all and date-range edge cases. F033, F076, F084, F086, F127, F128, F130, F132.
- [ ] 2.3 (L) Split MemberList and MemberProfile into focused components under 300 lines; shared Modal with dialog semantics, focus trap and Escape; labelled form controls; keyboard-operable rows and play buttons. F080, F082, F083, F087, F089, F125.
- [ ] 2.4 (M) Implement advanced search for real (server-side filtering on validated query schema), apply saved searches including quick filters, record usage. F038, F085, F097, F129.
- [ ] 2.5 (S) Shared `packages/shared` with zod schemas used by both backend validation and frontend types; dark-mode and line-clamp cleanup; display fixes. F039 (shared step), F121, F122, F131.

Exit criteria: Lighthouse accessibility score at or above 90 on members and media pages; Playwright covers navigation between all routes; no component over 300 lines.

### Phase 3: data model and analytics correctness (about 5 to 7 days)

Goal: a schema that means what the UI says and analytics computed from real data.

- [ ] 3.1 (M) Prisma enums for membershipStage, riskLevel, gender, maritalStatus, membershipType, Media.type, relationship, interaction/note/milestone types; shared enum exports. F026, F052, F058, F106.
- [ ] 3.2 (M) Real relations for authorId, staffMemberId, createdBy, addedBy, leaderId, headOfFamily; indexes on hot foreign keys and query columns; fix Media cascade; decide name fields (keep first/last, derive name). F053, F054, F055, F056, F051, F107, F109.
- [ ] 3.3 (M) `Service` model with date and type; Attendance references it; attendance denominator from services; filter by serviceDate. F025, F063.
- [ ] 3.4 (M) Trends from engagement snapshots, risk from all signals, recompute as a background job with concurrency and admin-only trigger; guard JSON parsing; CSV escaping and formula-injection protection. F059, F064, F065, F100, F061, F104, F072.
- [ ] 3.5 (S) Dead schema per decision D6: remove `LifecycleRule`, `TimelineActivity` and engagement automation fields, or keep behind a documented roadmap; keep Group, GroupMember, Family, tags for Phase 5. F057, F066, F108, F105.

Exit criteria: migration applies on SQLite and (in CI) Postgres; analytics tests assert scores from seeded attendance and activities.

### Phase 4: platform upgrades (about 4 to 6 days, only after Phase 1 tests exist)

- [x] 4.1 Postgres: moved to Phase 1 item 1.0 by owner decision D1.
- [ ] 4.2 (M) Next 16 and eslint-config-next 16, ESLint 10 (plain `eslint` already in use), React 19.3, TypeScript 5.9. F090, F117, F118, F119.
- [ ] 4.3 (M) Prisma 7 (new generator and `prisma.config.ts`). F047.
- [ ] 4.4 (S) Deployment target hardening: production env validation, structured logs shipped, backups for the database. foundation.

Exit criteria: CI green on the new majors; a documented rollback for each.

### Phase 5 and beyond (out of this plan's estimates)

Groups and ministries UI, attendance capture UI, real bulk actions, email/SMS communication, media approval workflow, family relationship editing, member tags UI. Each becomes a normal feature PR on the foundations above.

## 7. Decisions the owner must make

| Id | Decision | Options | Recommendation | Why | Needed by |
|---|---|---|---|---|---|
| D1 | Datastore | Stay SQLite; move to Postgres now; move in Phase 4 | **Decided: Postgres, first item of Phase 1** | Owner chose Postgres sooner; the provider switch needs a regenerated baseline migration, so it lands right after Phase 0 | Decided |
| D2 | Who can register | Open (today); open but inactive until admin approves; invite code only | **Decided: inactive until approved** | Minimal code, closes the anonymous-access hole, keeps self-signup | Phase 0 (0.7) |
| D3 | Session transport | Bearer token in localStorage (today); httpOnly cookie via Next rewrite | **Decided: httpOnly cookie** | Removes XSS token theft; rewrite also removes the hardcoded API host | Phase 1 (1.7) |
| D4 | API hosting | Keep Express service; fold API into Next route handlers | Keep Express | 32 routes and Prisma already exist; one process per concern is simpler to test and deploy | Phase 1 (1.3) |
| D5 | Package manager | npm workspaces; pnpm | npm workspaces | No new tool; your Claude settings already allow npm | Phase 1 (1.1) |
| D6 | Dead schema | Delete lifecycle automation and timeline copies; keep for a roadmap | **Decided: delete lifecycle, keep groups/tags/family** | Unused tables mislead; groups and tags are near-term features | Phase 3 (3.5) |
| D7 | Analytics inputs | Keep giving/volunteer scores with no data source; hide until data exists | Hide scores with no source; show attendance and community only | Avoid showing fabricated numbers to church staff | Phase 3 |
| D8 | Majors timing | Next 16, Prisma 7 now; after tests | After Phase 1 tests | Majors without tests are blind upgrades | Phase 4 |
| D9 | TypeScript 7 | Adopt; stay 5.9 | Stay 5.9 for now | Native compiler is new; Next and Prisma tooling still settling | Phase 4 |

## 8. Out of scope for this modernization

New product features beyond the README's current claims; mobile apps; Slack, email marketing, online giving and calendar integrations (README Phase 4); a design refresh beyond fixing broken styles; multi-tenant support; data import from other church systems.

## 9. How we will work

- Model assignment (owner instruction, 2026-10-04): planning, specification and review by Claude Fable 5.1; implementation agents run Claude Opus 5.5 at medium effort. Each Phase 1 item is specified in writing before an implementation agent starts it, and every agent's output is verified (typecheck, lint, tests, build) and reviewed before it is pushed.
- One branch and one pull request per phase, with Phase 0 and Phase 1 split into two PRs each if they grow past roughly 1,500 changed lines. Base branch `main`.
- Before every push: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` for both packages (from Phase 1 these are the root scripts and CI runs the same).
- Each PR description lists the finding ids it closes and the acceptance checks run, with command output.
- Progress is reported in this document: items get ticked, and a short "Verified" line is added under each phase when its exit criteria pass.
- No destructive data operations (migrations that drop columns, secret rotation in a shared environment) without a note in the PR and an explicit go-ahead.

## Appendices

### Appendix A. All findings

| Id | Sev | Title | Location | Phase |
|---|---|---|---|---|
| F001 | critical | Default admin credentials, hardcoded JWT secret and a signed token committed in ad-hoc debug scripts | backend/create-test-user.js:11 | initial-scope |
| F002 | critical | GET /api/member-details/:id returns the bcrypt password hash and every sensitive User column to any authenticated member | backend/src/routes/member-details.ts:12 | initial-scope |
| F003 | critical | Pastoral notes, prayer requests (incl. isPrivate) and interactions readable by any authenticated member | backend/src/routes/member-details.ts:214 | initial-scope |
| F004 | critical | All configuration hardcoded: JWT secret, PORT, DB URL and CORS origin; dotenv installed but never loaded, zero process.env reads, no .env.example | backend/src/server.ts:14 | initial-scope |
| F005 | critical | Open self-registration plus no role-based authorization anywhere exposes all CRM data and write routes to anonymous users | backend/src/server.ts:98 | initial-scope |
| F006 | critical | MemberList fetches /api/users, which never returns engagement, membershipDate or lastLoginAt; /api/users/enhanced is dead code | frontend/src/components/members/MemberList.tsx:66 | initial-scope |
| F007 | critical | Member list crashes on sort or advanced/saved search: helpers used in render before their const declaration (TDZ) | frontend/src/components/members/MemberList.tsx:124 | initial-scope |
| F008 | high | package-lock.json is gitignored; no lockfile has ever been committed | .gitignore:67 | initial-scope |
| F009 | high | No root package.json or workspaces; two independent npm projects with diverging toolchains | backend/package.json:1 | initial-scope |
| F010 | high | dev and start both run ts-node on source; no compiled output path; nodemon installed but unused | backend/package.json:7 | initial-scope |
| F011 | high | tsconfig is unedited tsc --init boilerplate: es2016 target, no outDir/rootDir/include | backend/tsconfig.json:14 | initial-scope |
| F012 | high | Five PrismaClient instances across modules, one created per request inside refresh-all and never disconnected | backend/src/routes/analytics.ts:106 | initial-scope |
| F013 | high | Any member can write notes, interactions and milestones about any other member | backend/src/routes/member-details.ts:244 | initial-scope |
| F014 | high | No request validation layer: bodies, query and params are destructured and coerced with no schema | backend/src/routes/member-details.ts:247 | initial-scope |
| F015 | high | req.user read on an un-augmented Express Request; 32 `: any` annotations cover every handler and the auth middleware | backend/src/routes/member-details.ts:311 | initial-scope |
| F016 | high | Monolithic server.ts mixes config, middleware, seeding, 17 route handlers and app.listen with module-level side effects | backend/src/server.ts:11 | initial-scope |
| F017 | high | Role seeding runs twice at startup with two incompatible permission formats; permissions column is never read | backend/src/server.ts:17 | initial-scope |
| F018 | high | No central error middleware or 404 handler; 36 hand-rolled try/catch/500 blocks; NODE_ENV never set | backend/src/server.ts:38 | initial-scope |
| F019 | high | No password policy and no password change/reset path | backend/src/server.ts:103 | initial-scope |
| F020 | high | No rate limiting or lockout on login/register | backend/src/server.ts:155 | initial-scope |
| F021 | high | Member directory endpoints and analytics expose every member's email, phone, lastLoginAt and giving/risk scores to all members | backend/src/server.ts:257 | initial-scope |
| F022 | high | Whole-congregation CSV export (emails, phones, giving scores) available to any authenticated member | backend/src/server.ts:303 | initial-scope |
| F023 | high | No automated tests, test runner, or ESLint/Prettier in backend; frontend has zero tests | backend/src/server.ts:590 | initial-scope |
| F024 | high | Engagement scores can be inflated by any member via unvalidated points/activityType | backend/src/routes/analytics.ts:58 | initial-scope |
| F025 | high | getTotalServicesInPeriod fabricates the attendance denominator; no Service/Event table exists | backend/src/services/memberAnalytics.ts:356 | next |
| F026 | high | MemberEngagement.membershipStage and riskLevel are free strings; UI offers stages the service never assigns | backend/prisma/schema.prisma:268 | initial-scope |
| F027 | high | No CI workflow, Dockerfile, compose or dependency-update automation | .gitignore:1 | next |
| F028 | high | Single route toggles four views with booleans instead of App Router segments | frontend/src/app/page.tsx:16 | initial-scope |
| F029 | high | No auth context/provider; user state lives in page.tsx and form callbacks are typed any | frontend/src/app/page.tsx:14 | initial-scope |
| F030 | high | No route protection or role gating; the only guard is an inline `if (!user)` and admin-only actions render for every user | frontend/src/app/page.tsx:62 | initial-scope |
| F031 | high | Lint is not enforced: deprecated `next lint`, default rules only, and existing errors block `next build` | frontend/src/components/media/VideoPlayer.tsx:46 | initial-scope |
| F032 | high | Tailwind v4 removed bg-opacity-*/ring-opacity-*/flex-shrink-*: thumbnails render as solid black boxes and modal backdrops are opaque | frontend/src/components/media/SimpleMediaLibrary.tsx:214 | initial-scope |
| F033 | high | Media search input loses focus on every keystroke and refetches without debounce or cancellation | frontend/src/components/media/SimpleMediaLibrary.tsx:65 | initial-scope |
| F034 | high | VideoPlayer playlist items only console.log; selecting one does nothing | frontend/src/components/media/VideoPlayer.tsx:365 | initial-scope |
| F035 | high | 'Add Member' POSTs to the public /api/auth/register and silently drops roles, bio and isActive | frontend/src/components/members/AddEditMemberModal.tsx:121 | initial-scope |
| F036 | high | Five bulk actions and 'Bulk Update Fields' are no-ops with no backend routes | frontend/src/components/members/BulkActionsToolbar.tsx:21 | initial-scope |
| F037 | high | 'Export Excel' downloads a JSON blob named members.excel; non-OK export responses are swallowed | frontend/src/components/members/MemberList.tsx:221 | initial-scope |
| F038 | high | evaluateAdvancedQuery is a stub returning true, so advanced/saved searches show every member and disable quick filters | frontend/src/components/members/MemberList.tsx:152 | initial-scope |
| F039 | high | Domain types duplicated and untyped across frontend; no shared API contract with backend so drift is invisible to tsc | frontend/src/components/members/MemberProfile.tsx:6 | initial-scope |
| F040 | high | API base URL hardcoded to http://localhost:5000 in 14 places across 7 files; no env configuration | frontend/src/lib/auth.ts:1 | initial-scope |
| F041 | high | No typed fetch wrapper: fetchWithAuth returns raw Response, ignores status/401, forces Content-Type, and callers re-parse `{success}` nine times | frontend/src/lib/auth.ts:122 | initial-scope |
| F042 | medium | Prisma migration_lock.toml is gitignored and absent although Prisma requires it to be committed | .gitignore:123 | initial-scope |
| F043 | medium | .claude/settings.local.json is committed and grants broad destructive Bash permissions | .claude/settings.local.json:11 | initial-scope |
| F044 | medium | helmet, morgan, dotenv and nodemon are declared but never imported; no security headers or request logging | backend/package.json:21 | initial-scope |
| F045 | medium | package.json metadata wrong: main points to a nonexistent file, license conflicts with README, test is a placeholder, prisma CLI in runtime deps, misindented line | backend/package.json:4 | initial-scope |
| F046 | medium | No Node version pin; README says Node 18+ (EOL); @types/node majors disagree (24 vs 20) and neither matches Node 22 | backend/package.json:31 | initial-scope |
| F047 | medium | Prisma 6.13 -> 6.19.3 resolved; 7.10 is a major with generator, config and adapter changes | backend/package.json:16 | next |
| F048 | medium | Migration history is SQLite-dialect and begins with a dead create/drop pair | backend/prisma/migrations/20250802124905_enhanced_membership_system/migration.sql:55 | later |
| F049 | medium | Postgres move checklist: Json/list column upgrades and semantic differences to apply together | backend/prisma/schema.prisma:8 | later |
| F050 | medium | User model carries 39 scalar columns mixing auth, demographics, church status, address, comms prefs and free-text notes | backend/prisma/schema.prisma:12 | next |
| F051 | medium | User.name is the only name written; firstName/lastName are dead and the frontend splits name for initials | backend/prisma/schema.prisma:16 | initial-scope |
| F052 | medium | Demographic fields gender, maritalStatus, membershipType are free strings; membershipType overlaps MemberEngagement.membershipStage | backend/prisma/schema.prisma:36 | next |
| F053 | medium | Media listing, engagement aggregates and composite-unique second columns lack indexes; per-user activity tables have no index on userId | backend/prisma/schema.prisma:331 | initial-scope |
| F054 | medium | Bare user-id columns (authorId, staffMemberId, createdBy, addedBy, leaderId, headOfFamily) have no @relation, cascade rule or index | backend/prisma/schema.prisma:406 | initial-scope |
| F055 | medium | Family.headOfFamily (string) and User.isHeadOfFamily (boolean) are two unlinked representations of the same fact | backend/prisma/schema.prisma:144 | next |
| F056 | medium | FamilyRelationship allows mirrored duplicates and direction is ambiguous | backend/prisma/schema.prisma:186 | next |
| F057 | medium | TimelineActivity is a denormalized copy that application writes never populate | backend/prisma/schema.prisma:309 | next |
| F058 | medium | Interaction/note/milestone/timeline type, category, priority, impact, status and channel are free strings with inconsistent vocab and defaults | backend/prisma/schema.prisma:316 | next |
| F059 | medium | Any member can trigger a full-database engagement recompute inside one HTTP request | backend/src/routes/analytics.ts:102 | initial-scope |
| F060 | medium | Media creation accepts arbitrary type and URL schemes and auto-approves content | backend/src/routes/simple-media.ts:58 | next |
| F061 | medium | JSON stored as strings is parsed without guards and Media.tags is filtered by raw substring on the JSON text | backend/src/routes/simple-media.ts:30 | next |
| F062 | medium | Activity metadata JSON strings are unvalidated req.body blobs; volunteer hours buried in metadata.hours | backend/src/services/memberAnalytics.ts:447 | next |
| F063 | medium | Attendance analytics filter on createdAt instead of serviceDate; serviceDate is a full DateTime inside a unique; no route writes attendance | backend/src/services/memberAnalytics.ts:40 | initial-scope |
| F064 | medium | getEngagementTrends returns monthly MemberActivity counts, not engagement history; no snapshot table | backend/src/services/memberAnalytics.ts:326 | next |
| F065 | medium | Risk level and lastActivity derive solely from MemberActivity, ignoring attendance and interactions | backend/src/services/memberAnalytics.ts:416 | next |
| F066 | medium | Group, GroupMember, MemberTag, UserTag and Family have no backend routes, so community/attendance scores are structurally zero | backend/src/services/memberAnalytics.ts:84 | next |
| F067 | medium | CORS is fully open to any origin | backend/src/server.ts:38 | initial-scope |
| F068 | medium | console.log is the logger (46 calls) and user emails/ids are logged on every authenticated request | backend/src/server.ts:77 | initial-scope |
| F069 | medium | 7-day bearer tokens stored in localStorage via an import-time singleton, with no revocation, refresh, algorithm pinning or claims | backend/src/server.ts:138 | initial-scope |
| F070 | medium | GET /api/users omits the engagement relation the member list filters on; /api/users/enhanced is dead | backend/src/server.ts:230 | initial-scope |
| F071 | medium | Business logic embedded in route handlers (CSV export, saved-search formatting, family merging) | backend/src/server.ts:325 | next |
| F072 | medium | CSV export has no quote escaping and no formula-injection protection | backend/src/server.ts:355 | next |
| F073 | medium | Route ordering is correct only by registration position; literal sub-paths sit under parameterised prefixes | backend/src/server.ts:496 | next |
| F074 | medium | Analytics view renders an empty inline shell under a fixed modal; dashboard quick-action buttons have no handlers and stats are placeholder text | frontend/src/app/page.tsx:271 | initial-scope |
| F075 | medium | Every component is 'use client'; no server-component boundaries | frontend/src/app/page.tsx:1 | next |
| F076 | medium | No server-state library; refreshTrigger counter prop forces refetch and every component owns loading/error/data state | frontend/src/app/page.tsx:20 | next |
| F077 | medium | Root layout has create-next-app metadata, a conflicting manual <title>, and imports Geist fonts it never applies | frontend/src/app/layout.tsx:15 | initial-scope |
| F078 | medium | No loading.tsx, error.tsx, not-found.tsx or error boundaries; six hand-rolled spinners | frontend/src/app/layout.tsx:20 | next |
| F079 | medium | Route file misplaced under components/members/ and unreachable; duplicates page.tsx wiring without an auth guard | frontend/src/components/members/page.tsx:1 | initial-scope |
| F080 | medium | Oversized components: MemberList 930 and MemberProfile 929 lines; six files over 300 lines; no shared UI primitives | frontend/src/components/members/MemberList.tsx:42 | next |
| F081 | medium | Edit Member cannot clear Phone/Bio or change roles/Active status | frontend/src/components/members/AddEditMemberModal.tsx:106 | next |
| F082 | medium | Modals lack dialog semantics, focus trap and Escape handling; icon-only close buttons are unlabeled | frontend/src/components/members/AddEditMemberModal.tsx:158 | next |
| F083 | medium | Clickable div/th elements, hover-only play buttons and unlabeled checkboxes are not keyboard operable | frontend/src/components/members/MemberList.tsx:516 | next |
| F084 | medium | currentPage is not reset when filters change, producing an empty table with no pager and no empty-state | frontend/src/components/members/MemberList.tsx:146 | initial-scope |
| F085 | medium | Saved searches cannot capture quick filters, never record usage, and save failures are silent | frontend/src/components/members/SavedSearches.tsx:150 | next |
| F086 | medium | Media library silently capped at 20 items by the backend default limit | frontend/src/components/media/SimpleMediaLibrary.tsx:48 | next |
| F087 | medium | Keyboard controls: Space can only pause, postMessage targets '*', listeners stop once the iframe has focus; volume/speed state is dead | frontend/src/components/media/VideoPlayer.tsx:108 | next |
| F088 | medium | YouTube embed URL built from an unvalidated capture group; falls back to embedding the raw URL | frontend/src/components/media/VideoPlayer.tsx:65 | next |
| F089 | medium | Form labels not associated with inputs; RegisterForm has no labels at all | frontend/src/components/auth/RegisterForm.tsx:60 | next |
| F090 | medium | Next.js pinned at 15.4.5; 16.x is a major that removes `next lint`, makes Turbopack default and needs eslint-config-next 16 / ESLint 10 / flat config | frontend/package.json:14 | next |
| F091 | low | Registration reveals whether an email is already registered | backend/src/server.ts:110 | later |
| F092 | low | User.email uniqueness is case-sensitive and emails are stored unnormalized | backend/src/server.ts:117 | next |
| F093 | low | Health endpoint does not verify database connectivity | backend/src/server.ts:87 | later |
| F094 | low | Identical Prisma select/include shapes repeated across handlers | backend/src/server.ts:231 | next |
| F095 | low | POST /api/auth/register response user lacks roles and includes every User column | frontend/src/lib/auth.ts:39 | initial-scope |
| F096 | low | Login never writes User.lastLoginAt | frontend/src/lib/auth.ts:62 | initial-scope |
| F097 | low | Saved-search usage counter can be bumped on any search by any user | backend/src/server.ts:476 | later |
| F098 | low | GET /api/media/:id ignores isPublic/isApproved | backend/src/routes/simple-media.ts:108 | later |
| F099 | low | Media title/description search relies on SQLite case-insensitive LIKE | backend/src/routes/simple-media.ts:24 | later |
| F100 | low | Sequential per-member recompute and duplicated queries in the analytics service | backend/src/services/memberAnalytics.ts:152 | later |
| F101 | low | Two zero-byte TypeScript modules tracked in backend/src | backend/src/media.ts:1 | initial-scope |
| F102 | low | Copy-paste instruction comments at the top of schema.prisma and server.ts | backend/prisma/schema.prisma:1 | initial-scope |
| F103 | low | Schema, migrations and dev.db are in sync but drift is not guarded | backend/prisma/schema.prisma:12 | next |
| F104 | low | User.volunteerSkills and User.interests are JSON-array strings with no backend writer; MemberTag already models interests | backend/prisma/schema.prisma:60 | next |
| F105 | low | Family denormalized analytics columns are never recomputed | backend/prisma/schema.prisma:152 | next |
| F106 | low | Group.type, GroupMember.role and Attendance.serviceType are free strings; co-leader needs @map for an enum | backend/prisma/schema.prisma:217 | next |
| F107 | low | MemberEngagement uses @@unique([userId]) plus a surrogate id to express a one-to-one | backend/prisma/schema.prisma:286 | next |
| F108 | low | LifecycleRule table and MemberEngagement automation fields have zero readers or writers | backend/prisma/schema.prisma:291 | later |
| F109 | low | Media.uploadedById defaults to ON DELETE RESTRICT so uploaders can never be deleted; other cascades wipe pastoral records | backend/prisma/migrations/20250731004844_add_auth_system/migration.sql:59 | next |
| F110 | low | Stale .gitignore entry for a Prisma output directory the generator does not use | backend/.gitignore:5 | next |
| F111 | low | frontend/.gitignore `.env*` blocks committing a .env.example | frontend/.gitignore:34 | initial-scope |
| F112 | low | Root .gitignore is generic boilerplate with duplicates and ignores .vscode wholesale | .gitignore:47 | later |
| F113 | low | No Prettier config or EditorConfig; formatting already inconsistent | backend/package.json:34 | initial-scope |
| F114 | low | No git hooks (husky/lint-staged) to run lint, format or typecheck before commit | .gitignore:1 | next |
| F115 | low | prisma CLI listed under dependencies instead of devDependencies | backend/package.json:24 | initial-scope |
| F116 | low | @types/bcryptjs is redundant: bcryptjs 3.x ships its own types | backend/package.json:27 | initial-scope |
| F117 | low | TypeScript ^5.8.3 / ^5 -> 5.9.3; 7.x (native compiler) is two majors away | backend/package.json:34 | later |
| F118 | low | react / react-dom pinned at 19.1.0; 19.3.0 current and @types already resolve 19.3 | frontend/package.json:12 | initial-scope |
| F119 | low | Dependencies that already resolve to current only do so by accident; raise declared floors when committing the lockfile | backend/package.json:20 | initial-scope |
| F120 | low | README documents a subset of endpoints, a nonexistent LICENSE and outdated setup; frontend README is create-next-app boilerplate | README.md:150 | later |
| F121 | low | Dark-mode body colours conflict with hardcoded light-only component classes | frontend/src/app/globals.css:15 | later |
| F122 | low | Custom line-clamp utilities duplicate Tailwind 4 built-ins | frontend/src/app/globals.css:28 | later |
| F123 | low | next.config.ts is empty: no API rewrite, image remotePatterns or headers | frontend/next.config.ts:3 | next |
| F124 | low | `@/` path alias configured but used in one file; everything else uses deep relative imports | frontend/tsconfig.json:22 | next |
| F125 | low | Raw <img> for remote avatars/thumbnails instead of next/image; third-party placeholder service | frontend/src/components/media/SimpleMediaLibrary.tsx:202 | later |
| F126 | low | Placeholder duration badge, empty-state shown on error, and inconsistent YouTube URL parsers in the media library | frontend/src/components/media/SimpleMediaLibrary.tsx:226 | later |
| F127 | low | Date-range end filter excludes members created on the end date | frontend/src/components/members/MemberList.tsx:116 | later |
| F128 | low | Select-all header checkbox compares global selection size with page length | frontend/src/components/members/MemberList.tsx:190 | later |
| F129 | low | AdvancedSearchBuilder: 'between' has no second input, Role falls through to free text, empty condition set counts as an active query | frontend/src/components/members/AdvancedSearchBuilder.tsx:49 | later |
| F130 | low | Stale closure in fetchRoles default-role logic | frontend/src/components/members/AddEditMemberModal.tsx:86 | later |
| F131 | low | 'Member since Not set', '0 month' duration, hard-coded en-US locale | frontend/src/components/members/MemberProfile.tsx:343 | later |
| F132 | low | Failed 'Refresh Scores' replaces the whole analytics dashboard with a close-only error view | frontend/src/components/analytics/MemberAnalyticsDashboard.tsx:129 | later |
### Appendix B. README claims versus code

| Feature | Schema | API | UI | Works end to end |
|---|---|---|---|---|
| Comprehensive Member Profiles (personal, church history, contact, family, ministry, skills/interests) | yes | partial | partial | partial |
| Advanced Search & Filtering (multi-criteria: name/email/phone/role/status/stage/engagement/risk/date; Advanced Search Builder) | yes | partial | yes | partial |
| Dual View Modes for members (table vs card) | yes | yes | yes | yes |
| Family Management (family units, head-of-family, relationships) | yes | partial | partial | no |
| Groups & Ministries (small groups, committees, service teams, leadership, meeting schedule) | yes | no | dead-button | no |
| Attendance Tracking | yes | no | no | no |
| Professional Video Player (YouTube-optimized, fullscreen) | yes | yes | yes | partial |
| Playlist Functionality | no | no | partial | partial |
| Enhanced Controls: keyboard shortcuts, custom overlays | no | no | yes | partial |
| Media Library: search, filtering, categorisation (tags) | yes | yes | yes | yes |
| Grid & List Views (media) | yes | yes | yes | yes |
| Role-Based Access Control (Admin / Leader / Member permission levels) | yes | partial | dead-button | no |
| JWT Authentication | yes | yes | yes | yes |
| User Profile Management (complete profile editing) | yes | partial | partial | partial |
| Mobile-First / Responsive Design | no | no | partial | unknown |
| Accessibility: WCAG compliant, ARIA labels, keyboard navigation | no | no | no | no |
| Helmet security middleware | no | no | no | no |
| CORS configuration | no | yes | no | yes |
| bcryptjs password hashing | yes | yes | yes | yes |
| Approval workflow for published media content | yes | no | no | no |
| Bulk member import/export | yes | partial | partial | partial |
| Communication tools (email/SMS) | yes | partial | dead-button | no |
| Membership analytics dashboard (engagement scores, stages, risk) | yes | yes | yes | yes |
| Saved searches | yes | yes | yes | partial |
| Bulk actions (update fields, add tags, email campaign, create group, print labels, reports) | partial | no | dead-button | no |
| Member timeline, notes, interactions, milestones (CRM) | yes | yes | partial | partial |
| Lifecycle rules / automation | yes | no | no | no |
| Member Tags (MemberTag / UserTag) | yes | partial | dead-button | no |
| Dashboard Quick Action: 'Upcoming Events' | no | no | dead-button | no |
| Dashboard Quick Action: 'Slack Workspace' | no | no | dead-button | no |
| Dashboard 'Membership Overview' stats card | yes | yes | partial | no |
| Default roles auto-created on first startup | yes | yes | no | yes |
| 'Add Member' button creates church members | yes | partial | yes | partial |
| TypeScript 'full type safety throughout' | no | partial | partial | partial |
| README API Endpoints section accuracy | yes | yes | partial | partial |

### Appendix C. Frontend to backend API contract

| Frontend call | Route exists | Issue |
|---|---|---|
| POST /api/auth/register (lib/auth.ts) | yes | [low] Body {email,password,name,phone} matches backend destructure (server.ts:100). Response user comes from prisma.user.create with no include (server.ts:117-124), so `user.roles` is absent although the frontend User type dec |
| POST /api/auth/login (lib/auth.ts) | yes | [low] Body {email,password} matches server.ts:157. Response {success,user(with roles.role),token} matches AuthResponse and every field page.tsx reads (name,email,phone,roles[].role.id/name,createdAt). Semantic gap: login never |
| GET /api/auth/me (lib/auth.ts) | yes | none |
| GET /api/users (components/members/MemberList.tsx) | yes | [high] Component reads member.engagement.engagementScore/riskLevel/membershipStage (MemberList.tsx:105-113, 654-685), member.lastLoginAt (629-631) and member.membershipDate (702-704), but the /api/users select (server.ts:231-24 |
| GET /api/users/export?format=:format&members=:commaSeparatedIds (components/members/MemberList.tsx) | yes | [medium] format=csv path is consistent (text/csv body; frontend blobs it, MemberList.tsx:217-221). format=excel: backend returns JSON {success,data} (server.ts:365) but the frontend still calls response.blob() and saves it as `me |
| GET /api/member-details/:id (components/members/MemberProfile.tsx) | yes | [critical] Every field the component reads exists in the response (full User include + familyMembers transform, member-details.ts:12-121). BUT the handler spreads the raw Prisma user (`...user`, member-details.ts:118) with no selec |
| GET /api/roles (components/members/AddEditMemberModal.tsx) | yes | none |
| PUT /api/users/:id (components/members/AddEditMemberModal.tsx) | yes | [medium] Body {name,phone,bio} matches server.ts:535. However the form also collects isActive (AddEditMemberModal.tsx:272-274) and selectedRoles (lines 63, 147-153, 250-266) and never sends them; the backend accepts neither, so r |
| POST /api/auth/register (components/members/AddEditMemberModal.tsx) | yes | [medium] Sent via fetchWithAuth so an Authorization header is present, but the route has no auth middleware and ignores it. Frontend sends {name,email,password,phone,bio} (lines 123-129); backend destructures only {email,password |
| GET /api/users/saved-searches (components/members/SavedSearches.tsx) | yes | none |
| POST /api/users/saved-searches (components/members/SavedSearches.tsx) | yes | none |
| DELETE /api/users/saved-searches/:id (components/members/SavedSearches.tsx) | yes | none |
| GET /api/analytics/members (components/analytics/MemberAnalyticsDashboard.tsx) | yes | none |
| POST /api/analytics/members/engagement/refresh-all (components/analytics/MemberAnalyticsDashboard.tsx) | yes | [low] Path and response {success,message} match (analytics.ts:124-127); the earlier `/members/:id/engagement/refresh` (analytics.ts:30) has 4 segments so it does not shadow this 3-segment path. Non-contract defect in the handl |
| GET /api/media?search=:term&tag=:tag (components/media/SimpleMediaLibrary.tsx) | yes | [low] Query params search/tag match simple-media.ts:11-31 and the response {success,media[{...,uploadedBy:{id,name}}]} covers id,title,description,url,tags,createdAt,uploadedBy.name. Frontend never sends `limit`, so the backen |
| POST /api/media (components/media/SimpleMediaLibrary.tsx) | yes | none |

Backend routes nothing in the frontend calls:

- GET /health (backend/src/server.ts:87) - no auth; nothing in frontend/src calls it
- GET /api/users/enhanced (backend/src/server.ts:257) - the only route that returns engagement/membershipDate/lastLoginAt; MemberList.tsx:66 calls /api/users instead
- POST /api/users/saved-searches/:id/use (backend/src/server.ts:476) - SavedSearches.tsx onLoadSearch (lines 223, 250) never posts usage, so usageCount/lastUsed ordering (server.ts:384-387) is inert
- GET /api/users/:id (backend/src/server.ts:496) - MemberProfile uses /api/member-details/:id instead
- GET /api/analytics/members/:id/engagement (backend/src/routes/analytics.ts:18)
- POST /api/analytics/members/:id/engagement/refresh (backend/src/routes/analytics.ts:30)
- GET /api/analytics/members/:id/trends (backend/src/routes/analytics.ts:42)
- POST /api/analytics/members/:id/activities (backend/src/routes/analytics.ts:58)
- POST /api/analytics/members/:id/interactions (backend/src/routes/analytics.ts:79)
- GET /api/member-details/:id/timeline (backend/src/routes/member-details.ts:129) - MemberProfile reads timelineActivities from the /:id payload instead
- GET /api/member-details/:id/interactions (backend/src/routes/member-details.ts:154)
- GET /api/member-details/:id/milestones (backend/src/routes/member-details.ts:184)
- GET /api/member-details/:id/notes (backend/src/routes/member-details.ts:214)
- POST /api/member-details/:id/interactions (backend/src/routes/member-details.ts:244) - no frontend form writes interactions
- POST /api/member-details/:id/milestones (backend/src/routes/member-details.ts:275) - no frontend form writes milestones
- POST /api/member-details/:id/notes (backend/src/routes/member-details.ts:303) - no frontend form writes notes; handler reads req.user.id (line 311) on an un-annotated express.Request while backend/tsconfig.json has strict:true (every other handler that touches req.user types req as any)
- GET /api/media/:id (backend/src/routes/simple-media.ts:104) - VideoPlayer receives the media object via props, never fetches by id

