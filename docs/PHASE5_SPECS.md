# Phase 5 implementation specifications: features

Companion to `MODERNIZATION_GAMEPLAN.md` section 6, Phase 5. Written by the planner for the implementation agents (Claude Opus 5.5, medium effort). Status: DRAFT 2026-10-12, awaiting owner approval of decisions P5-D1 to P5-D12 (section 4).

Phase 5 builds the six features that the README claims and that Phases 0 to 4 left as schema only:
- groups and ministries
- member tags
- family editing
- real bulk actions
- email communication
- the media approval workflow

It also closes the gaps that block those features or that they would make worse:
- no audit trail
- no way to record interactions from the UI
- a communication score that every broadcast email would drag down
- `GET /api/media/:id` returning unapproved items to any member
- password changes that leave other sessions signed in
- no way to edit communication preferences

**Shape.** Three streams ship as three pull requests into `main`, one after another (decision P5-D1). Each stream's branch is cut from `main` after the previous PR merges.

| PR | Stream | Branch | Contents |
|---|---|---|---|
| 5A | G (organise people) | `modernize/phase-5a` | Audit log, tags, groups, families, search filters |
| 5B | W (act on people and content) | `modernize/phase-5b` | Bulk actions, pending-approval queue, media approval |
| 5C | M (communicate) | `modernize/phase-5c` | Mail infrastructure, outbox and sending, unsubscribe and preferences, interaction recording, the communication score rule, account emails |

**Research basis.** The planner inventoried the schema, the modules, the shared package, the frontend and the tests on `main` at 0810134 on 2026-10-12. The file and line references below come from that inventory. Candidate dependencies were read from the registry on the same day:
- nodemailer 10.1.0: no dependencies, ships its own types, Node >=20
- twilio 6.2.0
- pg-boss 12.37
- graphile-worker 0.18

The planner chose a database outbox over pg-boss and graphile-worker (section 1.5).

## 0. Rules for every implementation agent

Same as `PHASE4_SPECS.md` section 0 (explicit versions, one concern per commit with the item id as message prefix, and the full required-checks list), except rule 3: this phase changes behaviour, exactly as the items below state. In addition:

1. **Migrations.**
   - Only forward migrations, never a new baseline. Folder names follow `YYYYMMDDHHMMSS_snake_name`.
   - Every migration that transforms data gets a `describe` in `backend/test/migrations.test.ts` with fixtures holding the legacy values.
   - Before a migration drops or overwrites a value, it copies the value into the `phase5_archive` schema (`CREATE SCHEMA IF NOT EXISTS`, never into `phase3_archive`, which the README lets operators drop).
   - The PR body lists every destructive step.
   - The drift check reports no drift after every item.
2. **Enums.** New Prisma enums are mirrored in `packages/shared/src/enums.ts` and added to `PRISMA_ENUMS`, so the parity test in `backend/test/enums.test.ts` covers them.
3. **New tables join `resetDatabase()`** in `backend/test/helpers.ts`, in foreign-key order.
4. **Authorization.**
   - Every new route declares its access level at the mount or the route.
   - Every new route joins `ROUTES` in `backend/test/routes.test.ts`.
   - Rules that depend on the object (submitter-owned media, a member's own family, own preferences) get behaviour tests in `backend/test/authorization.test.ts`.
   - A member asking for an object they may not see gets 404, never 403. A 403 would confirm the object exists.
5. **Audit.** From G1 on, every state-changing staff or admin action listed in section 1.3 writes an `AuditEvent` in the same transaction as the change.
6. **Shared schemas.** Body and query schemas live in `@embrace/shared`, one file per domain, built from `primitives.ts`. Route-local schemas go in the module's `schemas.ts`.
7. **Frontend.**
   - Components stay under the 300-line `max-lines` rule.
   - Each domain gets an API file in `lib/api/`, hooks in `lib/queries/`, and keys in `lib/queries/keys.ts`.
   - Role gating uses `useIsStaff` / `useHasRole`. It only shapes the UX; the API is the authority.
   - Every new page and dialog is covered by `expectNoSeriousA11yViolations` in Playwright.
8. **Docs.** Agents do not edit `docs/` or `README.md`. The planner updates the README's API, roles and operations sections when each PR is verified.
9. **Dependencies.** Only the dependencies in section 1.1 may be added, at those ranges.

## 1. Contracts

### 1.1 New dependencies and services

| Item | Where | Version | Why |
|---|---|---|---|
| `nodemailer` | backend, production (5C) | ~10.0.16 (past the 7-day Dependabot cooldown; 10.1 arrives through Dependabot) | SMTP transport with its own types and no dependencies. Works with any provider. |
| Mailpit | `docker-compose.yml` service `mail` under profile `mail`; CI service container for Playwright (5C) | Image pinned by digest | Catches mail in development and lets e2e assert delivery through its HTTP API. |
| SMS provider | none in Phase 5 if P5-D3 is accepted | n/a | See P5-D3. |

There is no queue library and no CSV parser (import stays out of scope).

### 1.2 Authorization matrix

| Capability | Member | Leader | Admin |
|---|---|---|---|
| Groups directory: active groups with name, type, schedule, location and leader names | yes | yes | yes |
| Own group memberships | yes | yes | yes |
| Group rosters, inactive groups, member counts | no | yes | yes |
| Create, edit or archive groups; manage rosters | no | yes | yes |
| Delete a group | no | no | yes |
| See and assign tags; create, edit or archive tags | no (P5-D12) | yes | yes |
| Delete a tag | no | no | yes |
| Own family (name and relatives' names), read only | yes | yes | yes |
| See and edit any family and its relationships | no | yes | yes |
| Delete a family | no | no | yes |
| Bulk actions (W1) | no | yes | yes |
| Submit media | yes, pending (P5-D6) | yes, published at once | yes, published at once |
| Edit or delete own pending or rejected submission | yes | yes | yes |
| Review, edit or delete any media | no | yes | yes |
| Send messages; see message history | no | yes (P5-D4) | yes |
| Own communication preferences | yes | yes | yes |
| Another member's preferences | no | yes (audited) | yes (audited) |
| Log interactions; mark responses | no | yes | yes |
| Audit log | no | no | yes |

Existing rules stay as they are:
- Only admins change roles or reset another user's password.
- Leaders have full staff access to members, analytics and services.

### 1.3 Audit events (`AuditAction` enum)

- **5A:**
  - From existing actions:
    - `user.role_changed`
    - `user.activated`
    - `user.deactivated`
    - `user.password_reset_by_admin`
  - `tag.created`, `tag.updated`, `tag.archived`, `tag.deleted`
  - `tag.assigned`, `tag.unassigned`
  - `group.created`, `group.updated`, `group.archived`, `group.deleted`
  - `group.member_added`, `group.member_updated`, `group.member_removed`
  - `family.created`, `family.updated`, `family.deleted`
  - `family.member_added`, `family.member_removed`
  - `family.relationship_set`, `family.relationship_removed`
- **5B:**
  - `bulk.applied`: one event per bulk call, with the action, the ids and the counts in `metadata`
  - `media.approved`, `media.rejected`, `media.deleted`
  - `user.exported`
- **5C:**
  - `message.sent`, `message.cancelled`
  - `user.preferences_changed_by_staff`
  - `user.password_reset_by_email`

Each event stores:
- the actor
- the action
- `targetType` and `targetId`
- an optional `count`
- `metadata` (JSON with no secrets, message bodies or passwords)
- `createdAt`

### 1.4 Changed contracts

- **Groups.** `Group.leaderId` is removed. Leaders are the `GroupMember` rows with role `leader` or `co_leader` (P5-D8).
- **Media.**
  - `Media.isApproved` and `Media.isPublic` are replaced by `status` (`pending`, `approved`, `rejected`) together with `reviewedById`, `reviewedAt` and `rejectionReason` (P5-D9).
  - `GET /api/media/:id` returns 404 for an item that is not approved, unless the caller is staff or the submitter.
- **Member export.** `GET /api/users/export` becomes `POST /api/users/export`, so the ids no longer travel in a query string.
- **Interactions.** `POST /api/analytics/members/:id/interactions` is removed. Nothing calls it, and `POST /api/member-details/:id/interactions` does the same job.
- **Communication score** (P5-D5). An ask is an interaction with `responseRequired = true` whose status is not `failed`, of any type. A response is an ask with `responseReceived` set or `responseTime` set. `email_sent` or `sms_sent` without `responseRequired` no longer counts as an ask, and `email_opened` and `sms_replied` rows no longer count as responses (nothing creates them, and opens are not tracked). The score with no asks stays 50. Stored snapshots are not rewritten.
- **Sessions.** Changing a password, an admin reset and an email reset each end every other session for that account (M7).
- **Family relationships.** The profile's family list returns only active relationships within the member's current family.

### 1.5 Outbox design (5C)

The analytics job runner keeps its state in memory and runs one job at a time (`backend/src/modules/analytics/jobs.ts:139`), so it cannot hold a send queue. Mail therefore goes through two tables:
- `Message`: what was sent, by whom, and to how many.
- `MessageRecipient`: one row per recipient, carrying its own status, attempts and next attempt time.

**The worker.**
- It runs inside the API process when mail is configured.
- It claims due recipients with `FOR UPDATE SKIP LOCKED`, which keeps it correct with more than one instance.
- It honours `MAIL_RATE_PER_MINUTE`.
- It retries transient failures (network errors, SMTP 4xx) three times, after 1, 5 and 25 minutes. An SMTP 5xx fails the recipient at once.
- On shutdown it stops claiming and waits for sends already in flight.
- Delivery is at least once. On startup, a recipient left in `sending` for more than 10 minutes returns to `queued`. A crash at the wrong moment can therefore send one duplicate. The README documents this.

**Why not a queue library.** pg-boss and graphile-worker each add a schema that Prisma does not manage, plus a dependency, for a queue this small.

## 2. Streams

### Stream G: organise people (PR 5A, `modernize/phase-5a`)

#### G1 Audit log (S)
- **Model** `AuditEvent`:
  - Fields: `id`, `actorId` (User, SetNull), `action AuditAction`, `targetType String`, `targetId String?`, `count Int?`, `metadata Json?`, `createdAt`.
  - Indexes: `createdAt`, `actorId`, and `(targetType, targetId)`.
- **Helper** `lib/audit.ts`: `audit(tx, actor, action, target, extra?)`. It takes the transaction client, so the event commits or rolls back together with the change.
- **Existing actions instrumented:** role change, `isActive` change and admin password reset.
- **API:** `GET /api/audit` (admin). Filters: actor, action, target, and a date range. Paged and newest first, with the actor's name included.
- **UI:** page `/admin/audit` (admin), with a filterable table and a link from each target to its profile, group or family.
- **Retention:** none. The README says so.

#### G2 Tags (M)
- **Migration:** add `MemberTag.updatedAt`.
- **Name rules:**
  - Names are trimmed and 1 to 40 characters.
  - Uniqueness is case-insensitive, checked in the service and backed by the existing `@unique`. No functional index, because Prisma would report drift.
  - `color` must match `^#[0-9A-Fa-f]{6}$`.
  - `category` is a `TagCategory`.
- **API** (`/api/tags`):
  - `GET /`: staff. Usage counts included; `?includeArchived`.
  - `POST /`: staff.
  - `PATCH /:id`: staff. Covers name, color, category and `isActive` (archive and unarchive).
  - `DELETE /:id`: admin. Cascades the assignments, and the audit event records how many were removed.
- **Assignment:**
  - `POST /api/users/:id/tags {tagId}` (staff) is idempotent.
  - `DELETE /api/users/:id/tags/:tagId` (staff).
  - Archived tags cannot be newly assigned, but existing assignments keep showing, marked as archived.
- **Read paths:**
  - The staff member list and search include each row's tags (id, name, color).
  - The profile response types `memberTags` (it is returned today but never typed or shown, `frontend/src/types/domain.ts`).
  - Members never receive tags (P5-D12), including on their own profile.
- **UI:**
  - A "Manage tags" dialog reached from the members page: list, create, edit and archive, plus delete for admins with the usage count in the confirmation.
  - Tag chips on member rows: at most 3, then "+n".
  - A Tags section on the profile for staff, with a picker built on `ChipInput` suggestions.

#### G3 Groups (L)
- **Migration (destructive step, P5-D8):**
  1. For each group with a `leaderId`:
     - if there is no `GroupMember` row for that user, insert one with role `leader`;
     - if there is a row with role `member`, raise it to `leader`.
  2. Copy the original `leaderId` values to `phase5_archive.group_leaders`.
  3. Drop the column and its index.
- **Validation:**
  - `name` is 1 to 100 characters.
  - `meetingDay` stays free text (up to 60).
  - `meetingTime` and `location` are bounded text.
  - `type` is a `GroupType`.
- **API** (`/api/groups`):
  - `GET /`, any signed-in user. Members get active groups only, with name, type, description, schedule, location and leader names. Staff also get inactive groups and member counts. `?mine=true` returns the caller's own memberships with their roles.
  - `GET /:id`. Members get the public fields if the group is active, otherwise 404. Staff also get the roster: name, role, `joinDate`, `isActive`.
  - `POST /`, `PATCH /:id`: staff. Archiving means `isActive = false`.
  - `DELETE /:id`: admin.
- **Roster** (staff):
  - `POST /:id/members {userId, role}`. A row that already exists returns 409.
  - `PATCH /:id/members/:userId {role?, isActive?}`.
  - `DELETE /:id/members/:userId`, which deletes the row (history lives in the audit log).
  - Only active users can be added.
- **Engagement:** the community score and the `core_member` stage start counting real memberships after the next refresh, run nightly by the existing CLI or by hand from Analytics. Changing a roster does not trigger a refresh. The README and the PR note say stages will shift on the first refresh after groups are in use.
- **UI:**
  - `/groups`: a directory for everyone; staff also get create, archive and filters by type and active.
  - `/groups/[id]`: details; for staff, the roster, with add-member search (reusing the member search with a debounced name query), role change and remove.
  - Nav item "Groups".
  - A Groups tab on the profile: staff see any member's groups, and members see their own.

#### G4 Families (L)
- **Migration:**
  - Add `CHECK ("primaryUserId" < "relatedUserId" COLLATE "C")`, which also rules out a pair of one user with themself. The application compares with JavaScript string order, which for these ASCII ids is the same as byte order, hence `COLLATE "C"`.
  - Before adding it, verify the data. Rows that break it are canonicalised the way `20261006020000` did, with the losers archived.
  - A family whose head is not one of its members is repaired:
    - if the head has no family, they join this one;
    - otherwise the head is set to null and the original value goes to `phase5_archive.value_changes`.
- **Rules (service):**
  - A user belongs to at most one family; this is already the case through `User.familyId`.
  - The head must be a member.
  - A relationship needs two different users who are both members of that family. It is stored once, through `normaliseFamilyPair` (`member-details/service.ts:53`).
  - When a member leaves a family:
    - their relationships in it are deleted;
    - if they were the head, the head is cleared.
- **API:**
  - `/api/families` (staff):
    - `GET /?q=&page=`: name search, member count, head name.
    - `GET /:id`: address, members, relationships expressed from each side.
    - `POST /`, `PATCH /:id`: covers name, address fields and `headOfFamilyId`, which must be a member.
    - `DELETE /:id`: admin. Unlinks the members and cascades the relationships.
  - Membership (staff):
    - `PUT /api/families/:id/members/:userId {move?: boolean}`. If the user already belongs to another family, this returns 409 unless `move` is true; a move deletes their relationships in the old family.
    - `DELETE /api/families/:id/members/:userId`.
  - Relationships (staff):
    - `PUT /api/families/:id/relationships {userId, relatedUserId, type}`, where `type` is `userId`'s relation to `relatedUserId`. It upserts.
    - `DELETE /api/families/:id/relationships/:relationshipId`.
  - `GET /api/families/mine` (any signed-in user): the family name and each relative's name and relationship. Contact details are not included.
- **Read path fix:** `getMemberDetails` returns only `isActive` relationships within the member's current family. It also returns `family.familyName` and the family address.
- **UI:**
  - `/families` (staff): list and create.
  - `/families/[id]` (staff):
    - edit name and address;
    - set the head;
    - add or remove members, with the move confirmation;
    - a relationship editor that lists the pairs and offers "Set relationship".
  - The profile's Family tab shows the family name instead of the raw `familyId` (`profile/Family.tsx:18`), links relatives to their profiles, and offers "Manage family" for staff.
  - Members see their own family read only.

#### G5 Search and list filters (S)
- **New `searchQuery` fields** (`packages/shared/src/search.ts`):
  - `tags`, with operators `includesAny`, `includesAll` and `excludesAll`, taking tag ids (1 to 20).
  - `groups`, with `includesAny` and `excludesAll`, taking group ids (1 to 20). It matches active memberships only.
  - `family`, with `isEmpty` and `isNotEmpty`.
- **Quick filters:** `listUsersQuery` gains `tagId` and `groupId`. `filtersToQuery` maps them.
- **Unknown ids:** a saved search that names a deleted tag or group matches nothing for that condition. It does not fail, and it shows a "(deleted)" chip.
- **UI:** the advanced search gains these fields. `MemberFilters` gains Tag and Group selects; it is at 232 lines, so the selects go into a child component.

#### G6 Tests and e2e (S)
- **Route matrix and authorization:** the matrix and the per-role tests cover every G route.
- **Migration tests:**
  - G3: a leader with and without an existing membership row.
  - G4: a reversed pair, a head who is not a member, and a head who belongs to another family.
- **Playwright** `organise.spec.ts`:
  1. Create a tag.
  2. Tag a member and filter the list by the tag.
  3. Create a group and add the member as co-leader.
  4. As that member, see the group under "my groups".
  5. Create a family, add two members, and set a spouse relationship.
  6. The other side's profile shows the inverse.

  Axe runs on every new page and dialog. The spec deletes what it created.

### Stream W: act on people and content (PR 5B, `modernize/phase-5b`)

#### W1 Bulk actions (M)
- **`POST /api/users/bulk`** (staff).
  - **Request:** `{ids: cuid[1..1000] (unique), action}`, where `action` is a discriminated union:
    - `add_tag {tagId}`
    - `remove_tag {tagId}`
    - `add_to_group {groupId, role = member}`
    - `remove_from_group {groupId}`
    - `activate`
    - `deactivate`
  - **Execution:**
    - It runs in one transaction: `createMany` with `skipDuplicates` and `deleteMany` / `updateMany` where possible, under the same per-row rules as `PUT /api/users/:id`.
    - `deactivate` skips the caller.
    - A leader cannot deactivate an admin.
    - Archived tags and inactive groups are refused with 400.
  - **Response:** `{matched, changed, skipped: [{id, reason: 'not_found' | 'self' | 'not_permitted' | 'unchanged'}]}`.
  - **Audit:** one `bulk.applied` event, plus `user.activated` or `user.deactivated` per changed user.
- **`POST /api/users/search/ids`** (staff) takes a `searchQuery` without paging. It returns `{ids (first 1000 in list order), total}` and powers "Select all N matching". When `total` is over 1000, the UI says only the first 1000 were selected.
- **`POST /api/users/export`** takes `{ids?}` and replaces the GET (1.4). It adds tag, group and family columns, keeps the formula-injection guard (`users/service.ts:143`), and writes the `user.exported` audit event.
- **Toolbar** (`BulkActionsToolbar.tsx`):
  - Buttons: Add tag, Remove tag, Add to group, Remove from group, Activate, Deactivate, Export.
  - Each mutating action opens a confirmation dialog naming the count. Deactivate uses a destructive style.
  - The result shows as a toast with "n changed, m skipped" and an expandable skipped list.
  - Remove the "return when they have a backend" comment and the duplicate "Export Selected" in `MemberListActions.tsx:57`.
- **Pending approval:**
  - A quick filter "Pending approval": `isActive = false` and `lastLoginAt` null, the same rule as `users/service.ts:86`.
  - The dashboard's Pending tile links to it.
  - Activate is the approval. 5C adds the approval email.

#### W2 Media approval workflow (M)
- **Migration (destructive step, P5-D9):**
  1. Add enum `MediaStatus {pending, approved, rejected}`.
  2. Add `status MediaStatus @default(pending)`, `reviewedById` (User, SetNull), `reviewedAt` and `rejectionReason`.
  3. Backfill: `isApproved = true` becomes `approved`, `false` becomes `pending`.
  4. Copy the rows where `isPublic = false` or `isApproved = false` to `phase5_archive.media_flags`.
  5. Drop `isApproved` and `isPublic`.
  6. Add an index on `(status, createdAt)`.
- **API** (`/api/media`):
  - `GET /`:
    - Members get `approved` items. With `?mine=true` they get their own submissions in every status, with the rejection reason.
    - Staff can pass `?status=pending|approved|rejected`. The default is `approved`.
  - `GET /:id`: approved items for everyone. Other items only for staff or the submitter, otherwise 404.
  - `POST /`:
    - A member's item is created `pending`. Limits: 10 submissions per user per 24 hours (express-rate-limit keyed by user id) and 20 pending at once (409).
    - A staff item is created `approved`, with `reviewedById` set to the staff member.
  - `PATCH /:id`: staff can edit any item. A submitter can edit their own item while it is pending or rejected, and the edit puts it back to `pending`.
  - `POST /:id/approve` and `POST /:id/reject {reason 1..500}` (staff). Each sets `reviewedById` and `reviewedAt`, and approving clears the reason.
  - `DELETE /:id`: staff can delete any item; a submitter can delete their own item unless it is approved.
- **UI:**
  - Members:
    - "Submit a video" opens `AddMediaDialog` with the submission copy.
    - "My submissions" lists their items with status badges and the rejection reason, plus edit or withdraw.
  - Staff:
    - A "Review queue (n)" tab with approve or reject dialogs and an embedded preview.
    - Edit and delete on every item.
    - A dashboard tile "Media awaiting review".
  - `MediaLibrary.tsx` is at 178 lines, so the queue and the submissions views are new components.

#### W3 Tests and e2e (S)
- **Backend tests:**
  - Matrix entries and authorization tests, including a member fetching another member's pending item (404) and a submitter editing an approved item (403).
  - The bulk endpoint with every action, every skip reason, the 1000 cap, and transaction rollback when one write fails.
  - The W2 migration test with approved, unapproved and non-public fixtures.
- **Playwright** `workflow.spec.ts`:
  1. Bulk-tag three members.
  2. Bulk-activate a pending registration, which can then sign in.
  3. A member submits a video.
  4. Staff reject it with a reason, and the member sees the reason.
  5. The member edits and resubmits, and staff approve.
  6. The item appears in the library.

  Axe runs on the toolbar dialogs, the review queue and "My submissions".

### Stream M: communicate (PR 5C, `modernize/phase-5c`)

#### M1 Mail infrastructure (M)
- **Environment** (`config/env.ts`, `.env.example` files, README):
  - `SMTP_URL`, for example `smtps://user:pass@host:465`, or `smtp://mail:1025` in development.
  - `MAIL_FROM`, for example `"Grace Church <office@example.org>"`.
  - `APP_URL`, the public web origin, used in links.
  - `MAIL_RATE_PER_MINUTE`, default 60.
  - `MAIL_WORKER`, default on.
- **Mail off** when `SMTP_URL` is unset:
  - Account emails are logged as `mail disabled: would send <kind> to user <id>`. Tokens and links are never logged.
  - Sending a message returns 503 `MAIL_DISABLED`.
  - `GET /api/public/config` returns `{mailEnabled}`, which the frontend uses to hide mail features.
- **Production rules** when `SMTP_URL` is set:
  - `MAIL_FROM` and an https `APP_URL` are required.
  - `smtp://` runs with `requireTLS` unless `SMTP_INSECURE=true`.
  - A malformed `SMTP_URL` is refused without echoing it, with the same discipline as `DATABASE_URL` in Phase 4.
- **`lib/mailer.ts`:**
  - `sendMail({to, subject, text, html, headers})` over a nodemailer transport created once.
  - Tests use nodemailer's `jsonTransport` through an injectable factory.
  - Subjects are refused if they contain CR or LF.
- **Compose:** a `mail` service (Mailpit, digest-pinned, profile `mail`) and a commented `SMTP_URL=smtp://mail:1025` in `.env.example`. Dependabot's docker-compose entry already covers the pin.
- **CI:**
  - The E2E job adds a Mailpit service container and sets `SMTP_URL`.
  - The Images job's compose smoke keeps running with mail off.

#### M2 Outbox and worker (L)
- **Models:**
  - `Message`:
    - `id`
    - `channel Channel` (only `email` is accepted in Phase 5)
    - `subject`, `body`
    - `category InteractionCategory?`, `responseRequested Boolean`
    - `createdById` (SetNull)
    - `status MessageStatus {queued, sending, sent, partially_failed, failed, cancelled}`
    - `recipientCount`, `createdAt`, `completedAt?`
  - `MessageRecipient`:
    - `id`, `messageId` (Cascade), `userId` (SetNull)
    - `address`, a snapshot taken at queue time
    - `status RecipientStatus {queued, sending, sent, failed, skipped, cancelled}`
    - `skipReason {opted_out, no_address, inactive}?`
    - `attempts`, `lastError` (500 characters at most, never containing credentials), `nextAttemptAt`, `claimedAt`, `sentAt`
    - `interactionId?`
  - Indexes: `(status, nextAttemptAt)` and `(messageId, status)`.
- **Worker** (`modules/communications/worker.ts`):
  - Follows section 1.5.
  - Started from `server.ts` after listen, and stopped in the existing SIGTERM path before Prisma disconnects.
  - Each successful send creates a `MemberInteraction` in the same transaction that marks the recipient sent. Its fields:
    - type `email_sent`, channel `email`, status `completed`
    - `category`
    - `responseRequired = message.responseRequested`
    - `staffMemberId = createdById`
    - `subject`
    - `metadata {messageId}`
  - A permanent failure creates an interaction with status `failed`.
  - Message status rolls up when no recipients are left queued.
- **Tests:**
  - Claiming under two concurrent workers: no double claim.
  - Retry timing with a fake clock.
  - A 5xx is permanent.
  - A stale `sending` row is reclaimed.
  - The rate limit holds.
  - Shutdown waits for in-flight sends.

#### M3 Messaging API and compose UI (M)
- **API** (`/api/communications`, staff):
  - `POST /messages/preview {recipients: {ids[1..1000]}}` returns `{willSend, skipped: {opted_out, no_address, inactive}}`.
  - `POST /messages` takes:
    - `channel: 'email'`
    - `subject` (1 to 200 characters, one line)
    - `body` (1 to 20,000 characters, plain text)
    - `category?`
    - `responseRequested` (default false)
    - `recipients: {ids}`

    It returns 202 `{messageId, recipientCount, skipped}`. The recipients and their skip reasons are fixed at this moment. Audit `message.sent`.
  - `GET /messages`: paged history with counts by status.
  - `GET /messages/:id`: the message with recipient statuses, paged.
  - `POST /messages/:id/cancel`: queued recipients become `cancelled`. Audit `message.cancelled`.
- **Rendering:**
  - The one merge field is `{{firstName}}`.
  - The HTML part is the escaped text, with paragraphs and `http(s)` links made clickable, followed by a footer: church name from `MAIL_FROM`, the reason the person received the email, and an unsubscribe link.
  - The text part carries the same footer.
- **Headers:**
  - `List-Unsubscribe` with the https link.
  - `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
  - `Reply-To` set to the sending staff member's address.
- **UI:**
  - A "Message" bulk action opens `ComposeDialog`: subject, body, category, an "Expects a reply" checkbox, and a live preview of the counts. The confirmation says "Send to N people".
  - `/communications` (staff): history, a detail view with recipient statuses that refreshes while the message is sending, and cancel.
  - With mail disabled, the action and the page show a "Mail is not configured" notice.

#### M4 Unsubscribe and preferences (S)
- **Token:** base64url of `userId.channel.mac`, where `mac` is HMAC-SHA256 under a key derived from `JWT_SECRET` with HKDF (info `unsubscribe-v1`). It does not expire. Rotating `JWT_SECRET` invalidates old links, and the README says so.
- **Public endpoint** `POST /api/public/unsubscribe` (rate-limited):
  - It accepts `{token}` as JSON, or the RFC 8058 form body with the token in the query.
  - It sets `emailOptIn = false`, is idempotent, and returns 400 for a bad token.
- **Frontend page** `/unsubscribe?token=` shows a confirm button. A GET never changes anything, because link scanners prefetch.
- **Preferences:**
  - `emailOptIn`, `smsOptIn` and `mailOptIn` join `updateUserInput` and `selfSelect` / `staffSelect`.
  - Members edit their own; staff edit others' with an audit event.
  - The profile's Contact section gets switches in place of the read-only text (`ContactInfo.tsx:31`).
- **Search:** `emailOptIn` and `smsOptIn` become `searchQuery` boolean fields.

#### M5 Interaction recording (S)
- **Profile Interactions tab:**
  - A "Log interaction" dialog: type (`call_made`, `visit_logged`, `note_added`, `email_sent`, `sms_sent`), channel, subject, notes, category, and "Expects a reply".
  - A "Mark response received" action on asks.
- **API:**
  - `PATCH /api/member-details/:id/interactions/:interactionId {responseReceived: true}` (staff). It sets `responseTime` in hours from `createdAt`.
  - Remove `POST /api/analytics/members/:id/interactions` (1.4).

#### M6 Communication score rule (S)
- Apply the 1.4 rule in `backend/src/modules/analytics/service.ts` (asks at :70 and :225-230, responses at :71 and :270-277).
- Update the shared description and the analytics tests: each case of the new rule, a failed ask ignored, and broadcast-only members staying at 50.

#### M7 Account emails and sessions (M)
- **Sessions:**
  - Add `User.passwordChangedAt DateTime?`.
  - `authenticate` refuses a token whose `iat` (in seconds) is before `floor(passwordChangedAt / 1000)`.
  - Change-password re-issues the caller's own cookie.
  - The admin reset and the email reset set the timestamp.
- **Registration notice:** a new registration emails every active staff member who has `emailOptIn` set. The email holds the name and email address and a link to the Pending approval filter.
- **Approval notice:** activating an account that has never signed in, singly or in bulk, emails the user "Your account is approved", with the sign-in link.
- **Password reset by email:**
  - `POST /api/auth/forgot-password {email}` always returns 202.
    - Limits: 5 per hour per IP and 3 per hour per email.
    - Nothing is sent for inactive or unknown accounts.
    - A new token invalidates the earlier ones.
  - `PasswordResetToken`:
    - `id`, `userId` (Cascade), `tokenHash` (SHA-256, unique), `expiresAt` (30 minutes), `usedAt?`, `createdAt`.
    - The raw token is 32 random bytes in base64url and appears only in the email.
  - `POST /api/auth/reset-password {token, password}`:
    - It applies the password policy and is single use.
    - It sets `passwordChangedAt` and audits `user.password_reset_by_email`.
  - Frontend pages `/forgot-password` and `/reset-password` are in the `(auth)` group. The "Forgot password?" link on sign-in shows only when `mailEnabled`.
- **Mail preferences:** account emails ignore `emailOptIn`, except the registration notice, which is a staff convenience.

#### M8 Tests and e2e (S)
- **Backend tests:** the matrix covers every M route, including the public ones (rate limits, bad tokens).
- **Playwright** `communicate.spec.ts`, with Mailpit:
  1. Select two members (one opted out), compose with "Expects a reply" and send.
  2. Mailpit receives exactly one email, with the footer and both List-Unsubscribe headers.
  3. Open the unsubscribe link and confirm; the profile then shows the member opted out.
  4. The history shows one sent and one skipped.
  5. Log a call and mark the response received.
  6. Forgot password: the email arrives, the reset works, and the old session is signed out.

  Axe runs on the compose dialog, `/communications`, `/unsubscribe`, and both password pages.
- **CI:** the restore drill and the image smoke stay green with mail off.

## 3. Verification by the planner (for each PR)

1. **Required checks.** Run the Phase 4 section 0 rule 4 list, the Playwright suite twice in a row, and the seed and refresh CLI on church_dev.
2. **Upgrade path.** Apply the new migrations to a copy of church_dev taken before the PR, holding data shaped like production. Confirm no drift afterwards, and replay each migration's archive rows by hand.
3. **Adversarial review**, with a verifier for each finding:
   - authorization and object-level access (IDOR)
   - migrations and data integrity
   - UX and accessibility
   - docs accuracy
   - regressions in Phases 1 to 4
   - 5C adds three lenses: security (tokens, header injection, unsubscribe and reset abuse, secrets in logs), worker correctness (crashes, concurrency, at-least-once delivery), and deliverability and compliance (footer, List-Unsubscribe, opt-out honoured).
4. **Wrap-up.** Fix the findings and recheck them. Update the README and the gameplan. Push and open the PR into `main`. A final review of the whole PR runs before merge.

## 4. Decisions (awaiting the owner)

| Id | Decision | Options | Recommendation |
|---|---|---|---|
| P5-D1 | Delivery shape | Three sequential PRs 5A, 5B, 5C (recommended); one Phase 5 PR; one PR per feature (six) | Three. Each PR is reviewable and has a coherent theme. 5B needs the tags and groups from 5A, and 5C needs the bulk selection and approvals from 5B. Six PRs would repeat the review overhead six times. |
| P5-D2 | Email transport | SMTP through nodemailer (recommended); a provider's HTTP API (Postmark, SES, Resend) | SMTP. Every provider offers it, so you can change provider without changing code, and Mailpit tests it end to end. A provider SDK can come later behind the same `sendMail`. |
| P5-D3 | SMS | Defer to a later phase (recommended); Twilio in 5C | Defer. US business texting needs A2P 10DLC registration, which takes weeks and costs money, plus STOP handling and phone number normalisation (phones are free text today). The data model (`Channel`, `smsOptIn`) is ready for it. |
| P5-D4 | Who may send messages | Staff, admins and leaders, audited (recommended); admins only | Staff, matching their existing access to every member's contact details. Every send is audited and confirmed with the recipient count. |
| P5-D5 | What counts as an "ask" in the communication score | Only interactions marked "expects a reply" (recommended); every email or SMS sent, as today | Expects a reply. Otherwise each newsletter lowers every recipient's score, because opens are not tracked and so no response can follow. |
| P5-D6 | Who submits media | Members submit for review, and staff posts publish at once (recommended); only leaders submit and admins approve; everything goes through review | Members submit. This delivers the README's "approval workflow" and "Leader: content approval" claims without slowing staff down. |
| P5-D7 | Group leaders | Group management stays with staff in Phase 5 (recommended); group leaders (`GroupMember` role leader) manage their own group's roster | Staff only for now. Delegation adds object-level permissions on every roster route. Revisit once groups are in use. |
| P5-D8 | `Group.leaderId` | Fold it into `GroupMember` roles and drop the column, archived (recommended); keep both and sync them | Fold. Two unsynced sources of "leader" disagree today (`schema.prisma:205-245`), and a group can have co-leaders. |
| P5-D9 | `Media.isPublic` and `isApproved` | Replace both with `status`, archived (recommended); keep `isPublic` as a staff-only visibility flag | Replace. `isPublic` has always been true (create hard-codes it), and a three-state status says what the workflow needs. |
| P5-D10 | Password reset by email | Include it in 5C, with session revocation (recommended); keep admin-only reset | Include it. It is the most-used account email, and the revocation fixes a real gap: today a changed password leaves other sessions signed in. |
| P5-D11 | Audit trail | Minimal `AuditEvent` table, an admin page, no retention limit (recommended); logs only | Table. Bulk changes, mass email and approvals need a record of who did what that survives log rotation. |
| P5-D12 | Tag visibility | Staff only (recommended); members see their own tags | Staff only. Tags such as "needs follow-up" are pastoral notes. |

## 5. Estimates

| Stream | Items | Agent time |
|---|---|---|
| G | G1 S, G2 M, G3 L, G4 L, G5 S, G6 S | About 5 days |
| W | W1 M, W2 M, W3 S | About 3 days |
| M | M1 M, M2 L, M3 M, M4 S, M5 S, M6 S, M7 M, M8 S | About 6 days |

Total: about 14 agent days plus about 4 planner days (reviews, upgrade drills, docs), roughly three and a half weeks at the current cadence. If P5-D3 is changed to include SMS, add about 4 days and the owner's 10DLC registration lead time.
