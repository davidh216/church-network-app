# Phase 2 implementation specifications: frontend structure and feature truth

Companion to `MODERNIZATION_GAMEPLAN.md` section 6, Phase 2. Written by the planner for the implementation agents (Claude Opus 5.5, medium effort). Status: DRAFT, awaiting owner approval. Two streams run in sequence, one agent per item: Stream S (shared schemas and backend search) first, then Stream F (frontend) on the merged result. The planner merges, verifies and reviews after each stream.

## 0. Rules for every implementation agent

Same as `PHASE1_SPECS.md` section 0, plus:
1. Required checks before finishing an item, from the repo root: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`; for Stream F items F1 onwards also `npm run -w frontend test:e2e` (Playwright, with the dev servers on free ports via `E2E_WEB_PORT`/`E2E_API_PORT`).
2. No component file under `frontend/src/components/**` or `frontend/src/app/**` may exceed 300 lines (tests excluded). Stream F adds an ESLint `max-lines` rule that enforces this; until then, respect it by hand.
3. Keep the Phase 1 contracts (`PHASE1_SPECS.md` section 1: session cookie, error shape, Postgres, env) unchanged. New contracts are in section 1 below.
4. Preserve authorization boundaries exactly: members see the name-only directory and their own profile; everything else is staff. Any new endpoint declares its access level and is added to the route matrix in `backend/test/routes.test.ts`.

## 1. New shared contracts

### 1.1 Shared package `@embrace/shared` (workspace `packages/shared`)
- Zod schemas and inferred types for every API input and for the search query: `createUserInput`, `updateUserInput`, `createMediaInput`, `createSavedSearchInput`, `searchQuery`, `loginInput`, `registerInput`, `changePasswordInput`, plus the enums already in `backend/src/lib/schemas.ts` (membership stage, risk level, interaction/channel/priority/impact/note types) and the password policy constants (min 12, max 128).
- Compiled with `tsc` to `dist` (ESM and CJS are not both needed: emit CommonJS with `.d.ts`; the backend is CommonJS and Next consumes CJS fine). `package.json` has `main`, `types`, `exports`, `files: ["dist"]`, `scripts.build`, and the root `build` script builds `packages/shared` before the two apps. `zod` is a peer dependency satisfied by the root.
- Backend imports schemas from `@embrace/shared` and deletes its local copies; frontend imports the types and uses the schemas for client-side form validation with the same rules the API enforces.
- CI, both Dockerfiles and compose build the shared package first (the Dockerfiles copy `packages/shared` and run its build in the build stage).

### 1.2 Member search and listing
- `GET /api/users` gains query parameters, all optional and validated: `q` (name/email/phone/bio contains, case-insensitive; members may search name only), `role`, `status` (`active|inactive`, staff only), `stage`, `risk`, `joinedFrom`, `joinedTo` (ISO dates, inclusive), `sort` (`name|email|createdAt|lastLoginAt|engagementScore|membershipStage`), `order` (`asc|desc`), `page` (default 1), `pageSize` (default 25, max 100). Response `{ success: true, users, total, page, pageSize }`. Members get the directory projection and may only use `q`, `sort=name`, `page`, `pageSize`.
- `POST /api/users/search` (staff): body is the `searchQuery` schema: `{ conditions: Array<{ field, operator, value }> (1..10), logic: 'AND' | 'OR', sort?, order?, page?, pageSize? }`. Allowed fields and operators: text fields `name|email|phone|bio` with `contains|equals|startsWith|isEmpty`; `roles` with `includes`; `engagement.engagementScore` with `gt|gte|lt|lte|between`; `engagement.membershipStage` and `engagement.riskLevel` with `equals|in`; `createdAt` and `lastLoginAt` with `before|after|between`; `isActive` with `equals`. `between` takes a two-element array. Same response shape as the list. Unknown field or operator is a 400 `VALIDATION`.
- Saved searches store exactly a `searchQuery` (validated on save and on load; a stored query that no longer validates is returned with `invalid: true` and cannot be applied). `POST /api/users/saved-searches/:id/use` is called by the UI when a saved search is applied.
- `GET /api/media` gains `page`, `pageSize` (default 24, max 100) and returns `{ success: true, media, total, page, pageSize }`; the fixed limit of 20 is removed. Media `url` must be a YouTube watch or share URL whose video id matches `^[A-Za-z0-9_-]{11}$`; the API stores the canonical `https://www.youtube.com/watch?v=<id>` and returns `videoId` alongside `url`.
- Dashboard counts: `GET /api/users/summary` (staff) returns `{ total, active, pendingApproval, newThisMonth }`; members get `{ total, active }` only.

### 1.3 Frontend routes
`/login`, `/register` (route group `(auth)`); `(app)` group with a shared shell layout (header, nav, sign-out) containing `/` (dashboard), `/members`, `/members/[id]`, `/media`, `/analytics` (staff). Each group has `loading.tsx` and `error.tsx`; the app has `not-found.tsx`. `middleware.ts` keeps the cookie redirect. Staff-only routes are guarded client-side by a `RequireStaff` component that redirects non-staff to `/` with a notice; the API remains the authority.

## 2. Stream S: shared schemas and backend search (branch `modernize/phase-2-backend`, directories `packages/shared/` and `backend/`, plus root workspace files, CI and Dockerfiles for the shared build)

### S1 (item 2.5 part) `@embrace/shared`
- Create the package per 1.1; move the schemas out of `backend/src/lib/schemas.ts` and `backend/src/modules/*/schemas.ts` where they describe API inputs (route-local wrappers such as params schemas may stay); backend uses the package. Root `package.json` workspaces gains `packages/*`; root scripts build shared first; `tsconfig.base.json` is extended by the package; CI and both Dockerfiles build it. Accept: all existing backend tests pass unchanged; `npm ci && npm run build` from a fresh clone works; `docker compose config` valid; actionlint clean.

### S2 (item 2.4 backend) member search
- Implement 1.2 for `GET /api/users` and `POST /api/users/search` in `modules/users` with Prisma `where` built from the validated query (no raw SQL), `mode: 'insensitive'` for text, `count` for `total`, `orderBy` for sort (engagement sorts join `engagement`), `skip/take` for paging. Member-role callers are restricted as stated. Tests: each operator on each allowed field, AND/OR, pagination math, sort directions, member restrictions (403 for `status`, name-only `q`), 400 for unknown field/operator, route matrix entries. Accept: a parameterised test over every field/operator pair passes.

### S3 (items 2.4 backend, F086, F088) media and saved searches
- Media pagination and strict YouTube validation per 1.2 (canonicalise on create; existing rows are left as stored and `videoId` is derived at read time, `null` if unparsable). Saved-search validation against `searchQuery`, `invalid: true` for stale rows, `/use` unchanged. Tests for each. Accept: creating media with a non-YouTube or malformed URL is 400; listing returns `total`.

### S4 (dashboard) `GET /api/users/summary` per 1.2 with tests and route-matrix entry.

## 3. Stream F: frontend (branch `modernize/phase-2-frontend`, directory `frontend/` only, runs after Stream S is merged)

### F1 (item 2.1) routes and layouts
- Implement 1.3. Move the existing views out of `app/page.tsx` into the routes; the dashboard shows real counts from `/api/users/summary` and quick links; the member profile becomes `/members/[id]` (the modal is removed; "View" is a link); media and analytics are routes. Delete the boolean view toggles and the `refreshTrigger` prop. `RequireStaff` guards `/analytics` and `/members/[id]` for non-self profiles. Accept: every route renders in `next build`; Playwright navigates `/`, `/members`, `/members/[id]`, `/media`, `/analytics`; a member visiting `/analytics` lands on `/` with a notice.

### F2 (item 2.2) server state
- Add `@tanstack/react-query@5`; `QueryClientProvider` in `providers.tsx`; query hooks per endpoint module (`useUsers(params)`, `useUser(id)`, `useMemberDetails(id)`, `useMedia(params)`, `useAnalytics()`, `useRoles()`, `useSavedSearches()`, `useUserSummary()`) and mutations (`useCreateUser`, `useUpdateUser`, `useCreateMedia`, `useRefreshAllEngagement`, saved-search create/delete/use) with invalidation. Media and member search inputs are debounced 300 ms with `placeholderData: keepPreviousData` so focus is never lost; the previous request is superseded (query keys include the params). Pagination is server-side (1.2); page resets to 1 when filters change; select-all operates on the current page and shows "N selected across pages" honestly; the date-range end is inclusive. Error and loading states come from the hooks (skeletons, inline retry). Tests with a `QueryClient` wrapper for each hook's success/error path. Accept: no `useEffect` fetches remain in `src/components`.

### F3 (item 2.3) component split
- `MemberList` becomes an orchestrator under 250 lines using `members/MemberFilters.tsx`, `MemberTable.tsx`, `MemberCards.tsx`, `MemberPagination.tsx`, `MemberRowActions.tsx`; pure helpers in `lib/members/filters.ts` (query-param building, date helpers) with unit tests. `MemberProfile` becomes the `/members/[id]` page composed of `profile/ProfileHeader.tsx`, `PersonalInfo.tsx`, `ChurchInfo.tsx`, `Family.tsx`, `Timeline.tsx`, `Notes.tsx`, `Tabs.tsx`. `SimpleMediaLibrary` becomes `media/MediaLibrary.tsx` plus `MediaFilters.tsx`, `MediaGrid.tsx`, `MediaListView.tsx`, `AddMediaDialog.tsx`; `VideoPlayer` splits out `PlaylistPanel.tsx` and `lib/media/youtube.ts` (id parsing and embed URL with the strict id check, unit tested). `MemberAnalyticsDashboard` splits its stat tiles and distribution lists. Add `max-lines: ['error', { max: 300, skipBlankLines: true, skipComments: true }]` for `src/components/**` and `src/app/**` in `eslint.config.mjs`. Accept: lint passes with the rule on; existing tests pass or are moved with their components.

### F4 (item 2.3 accessibility)
- Shared `Dialog` component (`role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape, focus restore, backdrop click, body scroll lock) used by AddEditMember, AddMedia and VideoPlayer; every input labelled (`<label htmlFor>` or `aria-label`); tables use `<th scope="col">`, sortable headers are `<button aria-sort>`; row actions are buttons or links; media play controls are real buttons visible on focus (not hover-only); icon-only buttons have `aria-label`; toasts and status messages use `role="status"`/`aria-live`; a skip link in the shell; visible focus styles; `next/image` with `remotePatterns` for `i.ytimg.com` thumbnails (avatars stay `<img loading="lazy" alt>` because their hosts are user-supplied). Add `eslint-plugin-jsx-a11y` (recommended, as errors) to the frontend lint. Add `@axe-core/playwright` and extend the Playwright smoke so `/login`, `/`, `/members`, `/members/[id]`, `/media` and `/analytics` each have zero `serious` or `critical` axe violations. Accept: lint clean with jsx-a11y; axe assertions pass in CI.

### F5 (item 2.4 frontend) advanced search and saved searches for real
- Rebuild `AdvancedSearchBuilder` on the `searchQuery` schema (field-aware operator and value inputs, `between` with two inputs, validation errors inline), calling `POST /api/users/search` through a `useMemberSearch(query)` hook; the member list shows an "Advanced query active" chip with a clear action and uses the search result for table, cards and pagination. Saved searches: list, save the current query (including quick filters converted to conditions), apply (calls `/use`), delete; stale rows marked invalid and not applicable; predefined searches re-enabled with valid queries. Remove `ADVANCED_SEARCH_ENABLED`, `PREDEFINED_SEARCHES_ENABLED` and the stub evaluator. Accept: Playwright creates an advanced query (stage equals new_member AND engagement gte 50), saves it, reloads, applies it, and the row count matches the API's `total`.

### F6 (item 2.5 frontend) adopt `@embrace/shared`
- Replace the hand-written input types in `types/domain.ts` with the shared inferred types; validate the register, login, add/edit member and add media forms client-side with the shared schemas (same messages as the API, shown inline); keep response types local. Accept: `grep -rn "min(12)\|MIN_PASSWORD_LENGTH = " frontend/src` returns nothing (the constant comes from shared); all tests green.

### F7 polish carried from the findings
- `noUncheckedIndexedAccess` turned on for the frontend (fix the handful of errors); the member search placeholder matches what the caller may search; Tailwind renamed utilities (`shadow-sm` to `shadow-xs`, `rounded` to `rounded-sm`, `bg-gradient-to-*` to `bg-linear-to-*`) updated; dark-mode body colours removed or made consistent; `line-clamp` custom CSS removed in favour of the built-in utility; `en-US` date formatting replaced with the browser locale; "Member since" shows a real date or nothing. F121, F122, F124, F127, F128, F131 and the Phase 1 review nits.

## 4. Verification by the planner
1. After Stream S: merge into `modernize/phase-2`, run all root checks against local Postgres, review the diff (security and contract lenses), fix, push.
2. After Stream F: merge, run all root checks plus Playwright with axe, adversarial review (accessibility, regressions, spec compliance, security), fix, update the gameplan, push, open the Phase 2 PR stacked on Phase 1.

## 5. Decisions for the owner before Stream F starts
| Id | Decision | Options | Recommendation |
|---|---|---|---|
| P2-1 | Member profile | Route `/members/[id]` (recommended); keep the modal | Route: shareable URL, back button, simpler state |
| P2-2 | Member list paging | Server-side 25 per page (recommended); keep client-side over the full list | Server-side: scales past a few hundred members and matches search |
| P2-3 | Avatar images | Keep user-supplied URLs with `<img>` (recommended now); restrict to uploads in Phase 5 | Keep; uploads need storage |
| P2-4 | Shared package packaging | Compiled CommonJS `dist` (recommended); Next `transpilePackages` on TS source | Compiled: one build path for backend, Docker and CI |
| P2-5 | Accessibility gate | axe `serious`/`critical` = 0 on six routes (recommended); add Lighthouse CI | axe first; Lighthouse later if wanted |

## 6. Estimates
Stream S: S1 L, S2 M, S3 M, S4 S (about 3 to 4 days of agent time). Stream F: F1 L, F2 L, F3 L, F4 L, F5 M, F6 M, F7 S (about 7 to 9 days). Planner merges and reviews add roughly 2 days. Phase 2 total: about two and a half to three weeks of calendar time at the current cadence.
