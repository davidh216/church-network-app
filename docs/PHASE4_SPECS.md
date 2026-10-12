# Phase 4 implementation specifications: platform upgrades

Companion to `MODERNIZATION_GAMEPLAN.md` section 6, Phase 4. Written by the planner for the implementation agents (Claude Opus 5.5, medium effort). Status: APPROVED 2026-10-11 with the planner's recommendations (P4-D1 TypeScript stays on 5.9, P4-D2 Node 24, P4-D3 ESLint 10, P4-D4 Prisma 7.10 with `prisma-client-js`, P4-D5 fix the React Compiler lint findings, P4-D6 Dependabot PRs #4 to #8 closed as superseded after merge, P4-D7 backup scripts with a CI restore drill). One stream (U) runs sequentially on branch `modernize/phase-4`, cut from `main` after the Phase 3 merge (PR #9). It ships as one pull request into `main`, with each major upgrade in its own commits so it can be reverted on its own.

Research basis: the planner read the registry metadata, release notes, upgrade guides and the shipped package contents for every target below on 2026-10-11. Next 16.4, eslint-config-next 16.4 and ESLint 10 were also trial-installed in a scratch copy of the repository: typecheck, the frontend tests, the build and a standalone-server smoke test all passed. Findings closed: F047, F090, F117 (decided), F118 (already at React 19.3), F119.

## 0. Rules for every implementation agent

Same as `PHASE3_SPECS.md` section 0, plus:
1. **Explicit versions only.** Never install `@latest`. The npm `latest` tag of `prisma` points at a Prisma 8 release candidate, and `typescript@latest` is 7.0, which typed ESLint cannot run on. Use the exact ranges in section 1.1.
2. **One concern per commit.** Each item below lands as one or more commits that touch only that item, with message prefix `U<n>:`. That way `git revert` of an item's commits is its rollback (section 1.3). Lockfile changes go in the same commit as the `package.json` change that caused them, and the lockfile is regenerated with `npm install`, never edited by hand.
3. **No behaviour changes.** Apart from what an item states, the API contracts of Phases 1 to 3, the UI, and the database schema and migrations stay exactly as they are. `prisma migrate diff` must keep reporting no drift, and no new migration is added in this phase.
4. **Required checks for every item.** Run these from the repo root: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, the drift check (U5 changes its command line), `docker compose config`, actionlint, and `npm run -w frontend test:e2e` on free ports. Items U5 and U6 also run the seed and the refresh CLI against church_dev.

## 1. Contracts

### 1.1 Target versions

| Package | From | To | Notes |
|---|---|---|---|
| Node (`.nvmrc`, Docker base, CI) | 22 | **24** (Active LTS until 2026-10-20, Maintenance to 2028-04-30) | Node 22 is in Maintenance and reaches end of life 2027-04-30 |
| `@types/node` | ^22.20 | **^24** (matches the runtime major) | Never ahead of the runtime: Dependabot ignores its majors |
| `engines.node` (4 package.json files) | >=22.12 | **>=24** | ESLint 10 needs >=22.13 and lint-staged 17 needs >=22.22.1 anyway |
| `next`, `eslint-config-next` | 15.5.27 | **~16.4.0** (in lockstep) | 16.4 contains the ESLint 10 compatibility shim; 16.3 does not |
| `react`, `react-dom` | 19.3.0 | unchanged | Already current; Next 16 accepts ^19 |
| `eslint` (all workspaces) | 9.39.5 (end of life) | **^10.12.0**, plus root `overrides.eslint` | jsx-a11y, eslint-plugin-react and eslint-plugin-import still declare peers up to ESLint 9 |
| `@eslint/js` | 9.39.5 | **^10.0.1** | |
| `typescript-eslint` | 8.71.0 | ^8.71.1 | Supports ESLint 10; TypeScript `<6.1` |
| `typescript` (all workspaces) | ^5.8.3 / ^5 | **~5.9.3** everywhere (decision P4-D1) | TS 7 has no compiler API yet, so typed ESLint cannot run on it |
| `prisma`, `@prisma/client` | 6.19.3 | **~7.10.0** | Stable line with long-term support. Prisma 8 is a release-candidate rewrite. |
| `@prisma/adapter-pg` | none | **~7.10.0** (production dependency) | Required driver adapter; brings `pg` |
| `lint-staged` | 16.4.0 | ^17.6.0 | No configuration change |
| `pg-connection-string` (backend, production) | none | ^2.14.1 | Reads DATABASE_URL with libpq semantics (`pgConfigFromUrl`) |
| `proxy-addr` (backend, production) | transitive | direct, the version express uses | Production TRUST_PROXY check |
| `mysql2` (root override, transitive via the Prisma CLI) | 3.15.3 | ^3.23.1 | Clears two high advisories; drop when Prisma updates it |
| Minor and patch updates | | express ^5.3.0, express-rate-limit ^8.7.1, @playwright/test ^1.64.0, concurrently ^10.0.6 | concurrently 10.0.6 fixes a critical advisory in shell-quote (dev only) |

### 1.2 Unchanged guarantees
- **Schema and data.** The schema, the migrations and their checksums stay as they are. A database migrated by Phase 3 runs unchanged on Phase 4, and a Phase 4 deployment can be rolled back to the Phase 3 image against the same database.
- **Runtime interfaces.** API responses, error shapes, cookies, rate limits, routes and the UI stay as they are. The one rename (`middleware.ts` to `proxy.ts`) is internal to Next.
- **CLI module format.** The refresh CLI and the seed stay CommonJS. The backend does not switch to ESM.

### 1.3 Rollback for each major
Each major upgrade is reverted by reverting its item's commits on a branch, then running `npm install` and the checks. In production, rolling back means redeploying the previous image tag; no database step is needed for any item.

| Item | How to roll it back | Database impact |
|---|---|---|
| U2 Node 24 | Revert the U2 commits and set both Dockerfiles' `FROM` lines to `node:22-alpine` by hand (they are digest-pinned since U7) | None |
| U3 Next 16 | Revert U4 first (ESLint 10 needs eslint-config-next 16), then the U3 and U3-fix commits. The `proxy.ts` rename and the lint config go back with them. | None |
| U4 ESLint 10 | Revert the U4 commits | None |
| U5 Prisma 7 | Revert the U5 commits, then `npm ci` regenerates the 6.x client | None. `_prisma_migrations` has the same format in 6 and 7, so 6 reads history written by 7 and both can run against one database during a rolling deploy. |

Lockfile and root `package.json` conflicts during a revert are resolved by regenerating with `npm install`. The gameplan's exit criterion "a documented rollback for each" is met by this table, which the README summarises and points to.

## 2. Stream U (branch `modernize/phase-4`)

### U1 Tooling baseline (S)
- **Minor and patch updates.** Apply the minor and patch rows of 1.1, plus `lint-staged` ^17.6.0.
- **One TypeScript range.** Pin `typescript` to `~5.9.3` in every workspace (the frontend currently says `^5`).
- **Lint fallout.** Fix any new lint findings from typescript-eslint 8.71.1 in the code, not by disabling rules.
- **Accept:**
  - All required checks pass.
  - `npm ls` exits 0.
  - `npm audit --omit=dev` reports 0 vulnerabilities.
  - The full `npm audit` has no critical advisories. The remaining high advisory (braces, pinned by `@next/eslint-plugin-next`) is listed in the PR as upstream and dev-only.

### U2 Node 24 (S)
- **Runtime version.** Set `.nvmrc` to `24`, and change all four Dockerfile `FROM` lines to `node:24-alpine`.
- **Types and engines.** Set `@types/node` to `^24` in the backend and frontend, and `engines.node` to `>=24` in all four package.json files.
- **Lockfile.** Regenerate it with the npm 11 that Node 24 ships, in its own commit.
- **README.** Update the prerequisites line (the planner edits the README).
- **Accept:**
  - All required checks pass on Node 24 locally and in CI (CI follows `.nvmrc`).
  - A grep shows no deprecated Node APIs in use (`url.parse`, `SlowBuffer`).

### U3 Next 16 (M)
- **Versions.** Move `next` and `eslint-config-next` to ~16.4.0 together.
- **Proxy rename.** Rename `frontend/src/middleware.ts` to `frontend/src/proxy.ts`, export `proxy` instead of `middleware`, and rename and update its test. The matcher is unchanged and no edge runtime is used.
- **Lint config.** Rewrite `frontend/eslint.config.mjs` as a native flat config: `defineConfig` and `globalIgnores` from `eslint/config`, plus `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
  - Add the jsx-a11y recommended **rules** only, because the Next config already registers the plugin and registering it twice fails.
  - Keep the existing extra rules and the 300-line `max-lines` rule.
  - Remove `@eslint/eslintrc`.
- **React Compiler lint rules.** eslint-plugin-react-hooks 7 brings in new rules (decision P4-D5). In the trial they reported 8 errors:
  - `react-hooks/refs` in `ui/Dialog.tsx`, `members/MemberFilters.tsx` and `members/MemberListActions.tsx`
  - `react-hooks/set-state-in-effect` in `lib/auth/AuthProvider.tsx` and `members/AddEditMemberModal.tsx`
  - `react-hooks/immutability` in `media/VideoPlayer.tsx`
  - `react-hooks/globals` in `lib/auth/AuthProvider.test.tsx`

  Fix each in the code with behaviour unchanged, under the existing tests (and new ones where a fix changes timing). A rule may be turned off only for test files, and only with a comment saying why.
- **Agent files.** Set `agentRules: false` in `next.config.ts`, so `next dev` does not write `frontend/AGENTS.md`.
- **Accept:**
  - All required checks pass, including the build with Turbopack and the Playwright suite twice in a row with axe.
  - The standalone server serves `/login` and redirects signed-out users from `/members`.
  - The build prints no deprecation warnings.

### U4 ESLint 10 (S)
- **Versions.** Move `eslint` to ^10.12.0 and `@eslint/js` to ^10.0.1 in backend, frontend and shared.
- **Single ESLint copy.** Add a root `overrides: { "eslint": "^10.12.0" }` so exactly one ESLint is hoisted; without it npm fails with ERESOLVE or installs two copies.
- **Config helper.** Switch backend and shared to `defineConfig` (`tseslint.config` is deprecated).
- **New recommended rules.** Fix any findings from them (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`).
- **Accept:**
  - All required checks pass.
  - `npm ls eslint` shows one version.
  - `npm ci` works from the new lockfile.
  - The lint-staged hooks still run.

### U5 Prisma 7 (M)
- **Packages.** Install `prisma` (dev), `@prisma/client` and `@prisma/adapter-pg` (production), each `~7.10.0`. Confirm that `npx -w backend prisma --version` prints 7.10.0.
- **Schema and config.**
  - Remove `url` from the `datasource` block in `schema.prisma`; Prisma 7 rejects it.
  - Keep the `prisma-client-js` generator (decision P4-D4), so the `@prisma/client` imports stay as they are.
  - In `backend/prisma.config.ts`, add `datasource: { url: process.env.DATABASE_URL ?? '', shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }` and keep `process.loadEnvFile()`. Prisma no longer loads `.env` itself.
- **Client construction.** `backend/src/lib/prisma.ts` builds the client with `new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 300_000 }, { schema })`.
  - `schema` comes from the URL's `schema` parameter, defaulting to `public`, because `pg` ignores `?schema=`.
  - Keep `omit`.
  - The timeouts restore the 6.x behaviour, so `/health` returns 503 promptly when the database is down. Add a test for that.
  - The seed builds its client the same way.
- **Tests.**
  - `test/global-setup.ts` drops `--schema` from `db execute`.
  - `test/migrations.test.ts` passes the URL through `env` instead of `--url`, and gives both fixture clients `PrismaPg` with `{ schema }`.
  - Delete `test/setup-env.mts`, the Prisma `.env` block in `test/env-file.test.ts`, and the `setupFiles` entry; Prisma no longer loads `.env`.
  - Update the stale comments in `lib/prisma.ts`.
- **CI drift check.** The new command, from the repo root, is `SHADOW_DATABASE_URL=postgresql://church:church@localhost:5432/church_test npx -w backend prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`. `--to-schema-datamodel` and `--shadow-database-url` were removed. The shadow database is wiped before use, so `SHADOW_DATABASE_URL` must never equal `DATABASE_URL`. The planner updates the documented command in the specs and README.
- **Search path (implementation note).** The adapter's `schema` option only qualifies the queries Prisma generates. Prisma 6 also set `search_path` from `?schema=`, so `pgAdapter` adds `options: -c search_path="<schema>"`. That keeps unqualified raw SQL (media search) on the URL's schema, and a migration test pins it. The schema's `search_path` is appended after any `options` already in the URL. The URL is read by `pgConfigFromUrl` (`backend/src/lib/pg-config.ts`), which keeps Prisma 6's meaning for SSL (libpq `sslmode`, `sslaccept`), pool size (`connection_limit`) and the connection wait (`connect_timeout`, default 5 s, or the larger of it and an explicit `pool_timeout`). A malformed URL stops start-up without echoing it.
- **mysql2 override (implementation note).** The Prisma 7.10 CLI pins `mysql2` 3.15.3, which has two high advisories. A root `overrides.mysql2: ^3.23.1` keeps `npm audit --omit=dev` at 0. Drop it once Prisma ships a fixed version.
- **Docker.**
  - Keep `apk add openssl`, which the schema engine needs for `migrate deploy`.
  - Run the local binary in the entrypoint (`npx --no prisma migrate deploy`), so a missing CLI fails instead of downloading the Prisma 8 release candidate.
- **Error mapping.** Check that the error handler maps the codes the 7.10 adapter produces (P2034 for deadlocks, P2003 for RESTRICT violations).
- **Accept:**
  - All required checks pass, with special attention to the migrations, relations, native-types, media-search, engagement and services tests.
  - `node dist/prisma/seed.js` and the refresh CLI run against church_dev.
  - `migrate deploy` on a Phase 3 database reports nothing to apply.
  - Drift check passes with the new command.

### U6 Deployment hardening (M)
- **Production configuration checks** (`backend/src/config/env.ts`). When `NODE_ENV=production`:
  - `CORS_ORIGIN` must be set explicitly, with no fallback to the localhost default, and every origin must be `https://` unless `COOKIE_SECURE=false`.
  - `JWT_SECRET` must not be trivially weak: refuse a value made of one repeated character, fewer than 10 distinct characters, or one containing `changeme`, `secret` or `example` (case-insensitive). `backend/.env.example` leaves it empty, so there is no placeholder to compare against.
  - `TRUST_PROXY=true` is refused, because it trusts any client's X-Forwarded-For; a hop count or a subnet list is required.
  - Failures exit at start-up with the same prettified message as today.
  - Tests cover each rule, and the compose stack still starts (it sets `COOKIE_SECURE=false` and an explicit `CORS_ORIGIN`).
- **Images built in CI.** A new job builds both Dockerfiles with `docker buildx build` (no push), then smoke-tests the compose stack:
  - It starts `docker compose up -d --build` with a generated `JWT_SECRET` and seed admin.
  - It waits for `api` and `web` to report healthy and checks `/health` and `/login`.
  - It runs the refresh CLI with `docker compose run --rm --entrypoint node api dist/jobs/refresh-engagement.js`.
  - It checks that `/health` returns 503 within 10 seconds after `docker compose stop db`.
  - This is the first place the images and the README's compose commands are exercised.
- **Backups** (decision P4-D7).
  - `scripts/db-backup.sh` writes `pg_dump -Fc` to a timestamped file in a target directory and deletes files older than a retention period (default 14 days). It takes the database URL from `DATABASE_URL`, or works through `docker compose exec db`.
  - `scripts/db-restore.sh` restores a dump into a named database with `pg_restore --clean --if-exists`.
  - CI runs a restore drill after e2e: dump church_dev, restore it into a fresh database, then `prisma migrate status` reports up to date and the row counts match.
  - The planner documents a nightly cron line and the restore runbook in the README.
- **Logs.**
  - The API writes JSON lines to stdout, and the README tells operators to collect stdout.
  - Compose sets the `json-file` logging driver with `max-size: 10m` and `max-file: 5` for `api` and `web`, so logs cannot fill a disk.
  - The API returns the request id in an `X-Request-Id` response header, so a user-reported error can be matched to its log line. Add a test.
- **Accept:** all required checks pass, the new CI job passes on the PR, and both scripts pass shellcheck.

- **Implementation notes.**
  - `X-Request-Id` already existed, so U6 added a test that each log line carries the same id.
  - The web service gained a compose healthcheck, so the smoke test can wait for it.
  - Restores also use `--no-owner --no-privileges --single-transaction`.
  - libpq rejects Prisma's `?schema=` parameter, so the scripts' helper strips it and passes the password through `PGPASSWORD`.
  - Run the seed and refresh CLI from `backend/`, so `backend/.env` is read.
  - In production TRUST_PROXY lists are compiled with `proxy-addr` (what Express uses). Unreadable values and lists that trust nearly every address are refused.
  - The backup scripts pass only libpq parameters to the client tools. They keep `user`, route `password=` through `PGPASSWORD`, and turn `sslaccept=strict` with `require` into `verify-full`.
  - Compose-mode backups are checked inside the database container.
  - Retention deletes only the script's own file names.

### U7 Supply chain (S)
- **Pinned actions.** Pin every GitHub Action in `ci.yml` by commit SHA with a `# vX.Y.Z` comment; Dependabot keeps both current.
- **Dependabot** (`.github/dependabot.yml`):
  - A 7-day cooldown for npm (14 days for majors).
  - Ignore majors of `@types/node`, which follow the runtime, and of `typescript`, until decision P4-D1 changes.
  - Named groups before the catch-all:
    - next and eslint-config-next
    - prisma and @prisma/*
    - typescript-eslint
    - react, react-dom and their types
    - vitest
    - @playwright/test and @axe-core/playwright
  - Group the github-actions updates.
  - Add a `docker` entry for both Dockerfiles that ignores Node majors.
- **CI audit gates.** After `npm ci`, run `npm audit --omit=dev --audit-level=high` and `npm audit signatures`. If `audit signatures` fails for a reason outside this repository, report it in the PR and keep the step non-blocking with `continue-on-error` and a comment.
- **Accept:** actionlint passes, Dependabot's configuration is valid (GitHub validates it on push), and CI is green.

- **Implementation notes.**
  - `npm audit signatures` is blocking; it passed on GitHub's runners.
  - The Node and PostgreSQL base images are pinned by digest, so Dependabot's docker and docker-compose entries can update them.
  - Dependabot ignores `@eslint/js` majors together with ESLint's.
  - `fsevents` stays out of `allowScripts`, so macOS keeps its prebuilt binary instead of compiling.
  - The root `allowScripts` lists esbuild, prisma, @prisma/engines and unrs-resolver; npm 11.21 treats it as advisory.
  - Dependabot also ignores ESLint majors, because the root override must move with the workspace ranges.

## 3. Verification by the planner
1. **After U1 to U4:** the required checks, Playwright twice with axe, a standalone-server smoke test, and an adversarial review covering regressions, lint config correctness, and the behaviour of the React Compiler rule fixes. Then fixes and a push.
2. **After U5 to U7:**
   - The required checks, the seed and refresh CLI on church_dev, and the upgrade path: a Phase 3 database (church_dev as it stands) under Prisma 7 with nothing to apply and no drift.
   - A rollback drill: run the pre-U5 build (Prisma 6) against the database Prisma 7 has used (migrate status, seed, refresh CLI, `/health`). As run: the U4 head in a scratch worktree against the dev database; all passed.
   - An adversarial review covering data access under the driver adapter, deployment and security, and the docs.
   - Fixes, the gameplan update, a push, and the PR into `main`.

## 4. Decisions (taken 2026-10-11: all recommendations accepted)
| Id | Decision | Options | Recommendation |
|---|---|---|---|
| P4-D1 | TypeScript | Stay on 5.9 (recommended); move to 6.0; move to 7.0 | Stay on 5.9. TS 7 has no compiler API, so typescript-eslint (peer `<6.1`) cannot run typed lint. Revisit when 7.1 ships its API and typescript-eslint supports it. 6.0 gains little now. |
| P4-D2 | Node | 24 (recommended); stay on 22; jump to 26 | 24: mature LTS supported by every dependency. 22 must go before April 2027 anyway. 26 becomes LTS on 2026-10-28; revisit it in 2027. |
| P4-D3 | ESLint | 10 with a root override (recommended); stay on 9 | 10. ESLint 9 is end of life, and the override is the documented way around plugins that have not updated their peer ranges. |
| P4-D4 | Prisma | 7.10 keeping the `prisma-client-js` generator (recommended); 7.10 with the new `prisma-client` generator; wait for Prisma 8 | 7.10 with the current generator: smallest change and every import stays. The new generator is a later, separate change. Prisma 8 is a release-candidate rewrite; reassess after it is generally available. |
| P4-D5 | React Compiler lint rules (react-hooks 7) | Fix the code (recommended); turn the rules off | Fix: the 8 findings point at real patterns (refs read during render, setState in effects). The fixes are small and under test. |
| P4-D6 | Open Dependabot PRs #4 to #8 | Close them as superseded once the Phase 4 PR merges (recommended); merge them one by one | Close as superseded. Phase 4 delivers each of them with the code changes they need (#4 Prisma 7, #6 ESLint 10, #8 eslint-config-next 16, #7 lint-staged 17). #5 (@types/node 26) is replaced by ^24 to match the runtime. |
| P4-D7 | Backups | Scripts plus documented cron plus a CI restore drill (recommended); a backup container in compose | Scripts and the drill: they work with any host or managed Postgres and prove restores work. A compose sidecar only covers the local stack. |

## 5. Estimates
U1 S, U2 S, U3 M, U4 S, U5 M, U6 M, U7 S: about 5 to 6 days of agent time plus 1.5 planner days, roughly one and a half weeks at the current cadence.
