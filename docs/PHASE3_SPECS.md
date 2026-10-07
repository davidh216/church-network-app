# Phase 3 implementation specifications: data model and analytics correctness

Companion to `MODERNIZATION_GAMEPLAN.md` section 6, Phase 3. Written by the planner for the implementation agents (Claude Opus 5.5, medium effort). Status: APPROVED 2026-10-05 with the planner's recommendations (P3-D1 computed only, P3-D2 minimal attendance UI included, P3-D3 giving and volunteer scores removed, P3-D4 CLI job plus endpoint, P3-D5 YOUTUBE_VIDEO only). One stream (D) runs sequentially, one agent per item, on branch `modernize/phase-3` cut from `main` after Phases 0 to 2 are merged. The planner verifies and reviews after D1 to D6 (backend) and again after D7 to D8 (frontend and tests).

## 0. Rules for every implementation agent

Same as `PHASE2_SPECS.md` section 0, plus:
1. Every schema change ships as a forward migration under `backend/prisma/migrations/` that upgrades a database holding Phase 2 data without loss; never a new baseline. Each migration that transforms data is tested against a fixture that contains legacy values (see D8). `prisma migrate diff --from-migrations ... --exit-code` must report no drift after every item.
2. Enum values keep the lowercase snake_case strings already stored (`visitor`, `new_member`, `sunday_service`), so existing rows cast without rewriting and the frontend keeps its labels. Media type keeps `YOUTUBE_VIDEO`.
3. `@embrace/shared` stays the single source of enum lists for the frontend; a backend test asserts every shared zod enum equals the Prisma enum's values.
4. Authorization boundaries are unchanged; every new route declares its access level and joins the route matrix.
5. Commit identity `Claude <noreply@anthropic.com>`; stage by explicit path; no edits to docs/ or README.md.

## 1. Contracts

### 1.1 Enums (Prisma `enum`, mirrored in shared)
- `MembershipStage`: visitor, new_member, active_member, core_member, leader, at_risk, inactive.
- `RiskLevel`: low, medium, high.
- `Gender`: male, female, other, prefer_not_to_say. `MaritalStatus`: single, married, divorced, widowed, separated. `MembershipType`: member, visitor, regular_attendee, inactive.
- `MediaType`: YOUTUBE_VIDEO.
- `RelationshipType`: spouse, parent, child, sibling, grandparent, grandchild, other. `GroupType`: ministry, small_group, committee, service_team. `GroupMemberRole`: leader, co_leader, member (existing `co-leader` rows are rewritten to `co_leader`).
- `ServiceType`: sunday_service, bible_study, prayer_meeting, special_event, other (unknown legacy values map to `other`).
- `InteractionType`: email_sent, email_opened, sms_sent, sms_replied, call_made, visit_logged, note_added. `Channel`: email, sms, phone, in_person, social_media. `InteractionStatus`: scheduled, completed, failed. `InteractionCategory`: welcome, follow_up, pastoral_care, event_invitation, giving_reminder, volunteer_request. `Priority`: low, normal, high, urgent.
- `MilestoneType`: first_visit, baptism, confirmation, wedding, first_volunteer, leadership_role, anniversary, other. `MilestoneCategory`: spiritual, service, family, personal, ministry, general. `Impact`: low, medium, high.
- `NoteType`: general, pastoral_care, follow_up, prayer_request, concern. `TagCategory`: ministry, demographic, interest, status, general.
- `ActivityType` (MemberActivity): service_attendance, event_attendance, donation, volunteer, ministry_participation, communication_open, profile_update, other.
- Any stored value outside a list is mapped in the migration to the enum's safest member (`other`, `general`, `medium`, `normal`, `low`) and the mapping is logged in the migration SQL as comments; no row is deleted.

### 1.2 Relations, keys and indexes
- Real relations with named fields: `MemberNote.authorId -> author: User` (Restrict), `MemberInteraction.staffMemberId -> staffMember: User?` (SetNull), `SavedSearch.createdById -> createdBy: User` (Cascade; column renamed from `createdBy`), `UserTag.addedById -> addedBy: User?` (SetNull), `Group.leaderId -> leader: User?` (SetNull), `Family.headOfFamilyId -> headOfFamily: User?` (SetNull); `User.isHeadOfFamily` is dropped (derived from `Family.headOfFamilyId`).
- `Media.uploadedById` becomes optional with `onDelete: SetNull`.
- `MemberEngagement.userId` becomes the primary key (surrogate `id` dropped).
- `FamilyRelationship` stores each pair once: the service normalises `(primaryUserId, relatedUserId)` so `primaryUserId < relatedUserId` and the unique index is on `(primaryUserId, relatedUserId)`; `relationshipType` describes the primary's relation to the related user; a migration dedupes mirrored rows.
- Indexes: every foreign key column; `users(isActive)`, `users(createdAt)`, `users(lastLoginAt)`, `users(membershipDate)`; `member_engagement(engagementScore)`, `(membershipStage)`, `(riskLevel)`; `media(createdAt)`; `member_notes(userId, createdAt)`, `member_interactions(userId, createdAt)`, `member_milestones(userId, achievedDate)`, `member_activities(userId, createdAt)`; `attendance(userId)`, `attendance(serviceId)`; `services(date)`.
- Email uniqueness stays case-insensitive by construction: every write path lowercases (already true) and a backend test proves it; no expression index (Prisma cannot model it).

### 1.3 Native column types
- `User.volunteerSkills`, `User.interests`, `Media.tags`, `Role.permissions` become `String[]`; `MemberActivity.metadata`, `MemberInteraction.metadata` become `Json?`; `SavedSearch.query` becomes `Json`. Migrations parse the stored JSON strings; unparsable values become `[]`, `null` or are rejected (saved searches: rows that do not parse are deleted after being listed in the migration comment).
- API responses carry arrays and objects, never JSON strings. The frontend stops parsing (`lib/media/format.ts`, `lib/members/profile.ts`).

### 1.4 Services and attendance
- `Service { id, date: DateTime @db.Date, type: ServiceType, title?: String, notes?: String, createdById?: User, createdAt }` with `@@unique([date, type])`.
- `Attendance { id, userId, serviceId, present: Boolean @default(true), notes?, createdAt, recordedById?: User }` with `@@unique([userId, serviceId])`; the migration creates one `Service` per distinct legacy `(serviceDate::date, serviceType)` and repoints rows.
- Routes (staff): `GET /api/services?from&to&type&page&pageSize`, `POST /api/services`, `GET /api/services/:id`, `PUT /api/services/:id`, `DELETE /api/services/:id` (admin; cascades attendance), `GET /api/services/:id/attendance` (`{ service, members: [{ user: {id,name,avatar}, present }] }` for every active member), `PUT /api/services/:id/attendance` (`{ present: string[], absent: string[] }`, idempotent upsert), `GET /api/member-details/:id/attendance?months=12` (services attended and the window's service count). Members: `GET /api/member-details/me/attendance` returns their own summary.
- Attendance denominator for scores and analytics is `count(Service where date in window and type in the scoring set)`; the scoring set is `sunday_service` by default and configurable per request with `types`.

### 1.5 Engagement, stage and risk (deterministic, documented)
- Engagement components with a data source today: `attendanceScore` (attended / services in the last 12 weeks, scoring set), `communityScore` (active group memberships: 0 -> 0, 1 -> 60, 2+ -> 100), `communicationScore` (response rate on two-way interactions in 12 months; 50 when there were none). `givingScore` and `volunteerScore` are removed from the model, API, CSV export and UI (decision D7). `engagementScore = round(0.6 * attendance + 0.2 * community + 0.2 * communication)`.
- `membershipStage` is computed on every refresh: `leader` if the account holds the leader or admin role; `inactive` if `isActive` is false or no attendance in 26 weeks while there were scoring services; `at_risk` if attendance in weeks 9 to 26 but none in the last 8 weeks; `visitor` if no `membershipDate` and fewer than 3 attendances ever; `new_member` if `membershipDate` is within 6 months; `core_member` if active and (any group membership or any `volunteer`/`ministry_participation` activity in 12 months); otherwise `active_member`. A staff override is out of scope (decision P3-D1).
- `riskLevel`: `high` when stage is at_risk or inactive, `medium` when attendance in the last 8 weeks is below 25% or stage is visitor, else `low`.
- `lastActivity` = max(latest attended service date, latest interaction, latest activity, lastLoginAt).
- `EngagementSnapshot { userId, month: DateTime @db.Date (first of month), engagementScore, attendanceScore, communityScore, communicationScore, membershipStage, riskLevel }` with `@@unique([userId, month])`, written on every refresh; `GET /api/analytics/members/:id/trends?months=` reads snapshots.
- `POST /api/analytics/members/engagement/refresh-all` starts a background job (in-process, concurrency 5, idempotent) and responds `202 { jobId }`; `GET /api/analytics/jobs/:id` reports `{ status, processed, total, startedAt, finishedAt }`. `node dist/jobs/refresh-engagement.js` runs the same job from a scheduler (documented for cron and compose). No in-process timer.
- Analytics windows filter on `Service.date`, `achievedDate`, `createdAt` of the right table, never on `Attendance.createdAt`.

### 1.6 Deletions (decision D6)
- Tables `lifecycle_rules` and `timeline_activities` are dropped; `MemberEngagement` loses `automationTriggers`, `stageTransitionDate`, `nextReviewDate`, `followUpRequired`, `followUpDate`; `Family` loses `familyEngagementScore`, `lastCalculated`, `totalMembers`, `activeMembers`.
- The member timeline becomes a computed feed: `GET /api/member-details/:id/timeline?page&pageSize` merges interactions, milestones, notes (visible ones) and attendance into `{ items: [{ kind, date, title, summary, id }], total }` ordered by date desc; the profile Timeline tab uses it.

## 2. Stream D (branch `modernize/phase-3`; backend/, packages/shared/, frontend/ where stated)

### D1 Deletions and the computed timeline (1.6)
Migration drops the tables and columns; member-details service and shared types drop `timelineActivities`; new timeline endpoint with tests; frontend Timeline tab reads the new endpoint (minimal change, keep the tab's look). Accept: no reference to `LifecycleRule`, `TimelineActivity`, `automationTriggers` remains; timeline endpoint tested for ordering, paging and note visibility.

### D2 Enums (1.1)
Prisma enums, migration with value normalisation, shared zod enums regenerated from one list (`packages/shared/src/enums.ts` is the source; a backend test compares with `Prisma.$Enums`), services and routers typed with the enums, frontend selects and labels derived from shared (no string literal lists left in `frontend/src`; a polish test guards it). Accept: `grep` for the removed literal lists is empty; migration applies on a fixture containing `co-leader` and unknown values.

### D3 Relations, keys and indexes (1.2)
Migration renames `createdBy -> createdById`, `headOfFamily -> headOfFamilyId`, adds foreign keys with the stated delete rules (existing dangling ids are set null or, for `authorId`, repointed to the oldest admin and listed in the migration comment), drops `User.isHeadOfFamily` and `MemberEngagement.id`, dedupes family relationships, adds every index. Services and selects use the relations (`author: { select: { id, name } }`). Accept: `EXPLAIN` is not required; the drift check passes; tests cover the delete rules and the family pair normalisation.

### D4 Native types (1.3)
Migration converts the columns; shared types and schemas use arrays and objects; media create/list, profile skills/interests, saved searches and role permissions work on native types; frontend parsing removed. Accept: a fixture with malformed JSON strings migrates per 1.3; CSV export unaffected.

### D5 Services and attendance (1.4)
Models, migration from legacy attendance, `services` module with all routes, attendance summary on member-details, route matrix, tests for uniqueness, idempotent bulk upsert, member self-summary and staff gating.

### D6 Engagement, stage, risk, snapshots, jobs (1.5)
Rewrite `modules/analytics/service.ts` around the rules; remove giving and volunteer everywhere (model, migration, CSV, shared types); snapshots and trends; background job with status endpoint and CLI entry (`backend/src/jobs/refresh-engagement.ts`, built to `dist/jobs`); unit tests with a seeded fixture that asserts each stage and risk rule and the score arithmetic; `getMemberAnalytics` distributions and averages computed from the new fields. Accept: a table-driven test enumerates every stage rule with a fixture that triggers it; refresh-all returns 202 and the job completes in tests.

### D7 Frontend adaptations
Engagement tiles and profile show three components; stage and risk labels from shared; tags, skills and interests as arrays with chip inputs in the edit form; `/services` staff route: list (by month), create service dialog, attendance sheet (checkbox per active member, saved with the bulk endpoint, keyboard operable, axe clean); profile Attendance tab (own summary for members, full for staff); dashboard tile "Services this month" for staff. All under 300 lines per component, jsx-a11y clean, tests for each component and hook.

### D8 Tests, fixtures and e2e
`backend/test/migrations.test.ts`: applies the Phase 2 baseline plus a legacy fixture (JSON strings, `co-leader`, unknown stage, attendance rows, mirrored family pairs, dangling `authorId`), runs `migrate deploy`, asserts the transformed data. Playwright: staff creates a service, marks two members present, the member profile shows the attendance, the engagement refresh job completes and the analytics page reflects it; axe on `/services`. Route matrix complete.

## 3. Verification by the planner
1. After D1 to D6: root checks, drift check, migration test against a Phase 2 database, adversarial review (data integrity, security, contract), fixes, push.
2. After D7 to D8: root checks plus Playwright with axe, review (accessibility, regressions, spec compliance), fixes, gameplan update, push, PR into `main` (opened as #9).

## 4. Decisions (taken 2026-10-05: all recommendations accepted)
| Id | Decision | Options | Recommendation |
|---|---|---|---|
| P3-D1 | Stage and risk | Computed only (recommended); computed with a staff override field | Computed only; an override is a Phase 5 feature if staff ask for it |
| P3-D2 | Services and attendance UI | Minimal staff UI in Phase 3 (recommended); backend only, UI in Phase 5 | Include it: without a way to record attendance every score stays zero |
| P3-D3 | Giving and volunteer scores | Remove entirely (recommended, per D7); keep hidden columns | Remove; reintroduce with a real data source |
| P3-D4 | Engagement refresh scheduling | CLI job for cron plus on-demand endpoint (recommended); in-process nightly timer | CLI plus endpoint; no timers inside the API process |
| P3-D5 | Media types | Enum with `YOUTUBE_VIDEO` only (recommended); keep five values | Only what the app can play |

## 5. Estimates
D1 M, D2 L, D3 M, D4 M, D5 L, D6 L, D7 L, D8 M: about 10 to 12 days of agent time plus 2 planner days; roughly three weeks at the current cadence.

## 6. Backend review outcome and amendments (2026-10-05)
D1 to D6 were implemented on `modernize/phase-3` and verified by the planner (root checks, drift check, Playwright, and the full migration chain replayed on a restored Phase 2 database with an identical resulting schema). A five-lens adversarial review (migrations and data integrity, security and authorization, contract and regressions, engagement rules, spec compliance) with one skeptical verifier per finding confirmed 33 findings, none a blocker after verification, and refuted 11. The rulings below amend sections 1 and 2 and were applied by the fix batches.

### 6.1 Amendments to the contracts
- **Family relationship meaning (1.2).** `relationshipType` is the primary user's relation to the related user. Legacy rows used the opposite meaning, so the D3 migration inverts every legacy type before it collapses and orders the pairs.
- **Audit trail (1.1 to 1.4).** Every row a Phase 3 migration deletes, repoints or maps to a fallback value is copied first into schema `phase3_archive`, which Prisma does not manage. Collapsed attendance rows merge their notes. An unknown legacy service type is kept as a note on the attendance row. The operator can drop the archive schema after checking it.
- **JSON columns (1.3).** Legacy metadata that does not parse, or is nested 64 levels or deeper, is kept as a JSON string of the original text. Such saved searches are archived and deleted. The API rejects U+0000 in text inputs and metadata nested deeper than 32 levels.
- **Orphaned note authors (D3).** Notes are repointed to the oldest admin. If there is no admin, the migration stops with a message telling the operator to create one.
- **Communication score (1.5).** Asks are `email_sent`, `sms_sent` and interactions that require a response. Responses are `email_opened`, `sms_replied`, and asks marked as answered. The score is `min(100, round(100 * responses / asks))`. It is 100 when there are responses but no asks, and 50 when there are neither.
- **Account age (1.5).** Services held before the account was created never count against it. This applies to the 12-week attendance denominator, the 8-week risk rate and the 26-week inactive check. Attendance at services dated after today is never counted.
- **Ratified readings of 1.5.**
  - Windows are whole UTC days ending today. "Last N weeks" means the 7N days up to and including today. "Weeks 9 to 26" means days 56 to 181 before today.
  - Attendance at any service type counts for the presence checks, while rates use the scoring set.
  - The community score counts active memberships of active groups.
  - With no scoring services in the last 8 weeks, the medium-risk rate rule does not apply.
  - Components are whole numbers, and `engagementScore` is computed from them.
  - The job refreshes every account, inactive ones included, and keeps the status of the last 20 jobs in memory.
  - A member deleted during a run counts as skipped.
  - On shutdown the API waits up to 8 seconds for a running job.
  - `atRiskMembers` counts high-risk active accounts.
- **Timeline and member details (D1, D5).**
  - Timeline items carry `dateOnly`, and calendar dates render in UTC.
  - An unknown member gets 404.
  - Paging is capped at page 100, and the client disables Next there.
  - `lastAttended` in member details is computed from attendance.
- **Refresh job in the client (D6, D7).** The analytics refresh button polls the job status and refreshes the data only once the job has finished.
- **Accepted additions beyond the text.**
  - Timeline responses carry `page` and `pageSize`.
  - Service dates are `YYYY-MM-DD` strings.
  - The attendance sheet also lists inactive accounts that already have a row.
  - Members may edit their own skills and interests.
  - The media tag filter matches a whole tag, ignoring case.

### 6.2 Refuted or deferred
- **Ownerless saved-search deletion stays.** Deleting saved searches whose owner no longer exists follows the column's Cascade rule. Those rows are now archived first.
- **Stale stored scores are documented, not recomputed.** Stored scores keep their pre-upgrade values until the first refresh after deploy. This is the documented design, so the README tells the operator to run the refresh job once after upgrading.

## 7. Frontend review outcome (2026-10-06)
D7 ran as two items: D7a covered the engagement, profile, edit form and dashboard tile, and D7b the `/services` route and attendance sheet. D8 followed them. A five-lens adversarial review covered accessibility, contract and regressions, UI authorization, test quality and spec compliance, with one skeptical verifier per finding. It confirmed 48 findings (16 should-fix and 32 nits) and refuted 3. The planner added one item, F051. An independent checker rechecked each of the four fix batches, and the planner closed the three gaps those rechecks found.

### 7.1 Behaviour settled by the fixes
- **Attendance sheet.**
  - The sheet keeps only the user's own unsaved changes on top of the latest server sheet. A save sends only the marks that differ from the server, so another staff member's marks are never overwritten. Changes made while a save is in flight are kept and reported as unsaved.
  - Closing the sheet with unsaved changes asks for confirmation.
  - Escape in the filter clears it, and Enter does not save. The shared Dialog ignores an Escape that a control inside has already handled.
  - Each row shows the member's email. When two members share a name, the label includes the email.
  - The dialog is named after the service.
- **Service dialog.**
  - Errors are linked to their fields and receive focus.
  - Editing sends only the changed fields.
  - The month list shows a loading state while a month loads, and its note says which services it lists.
- **Chip inputs.**
  - Tab commits the entry and focus moves on.
  - Removing a chip moves focus to a neighbouring chip.
  - A refused entry keeps the typed text and shows a visible message.
- **Media tags.** Tags are normalised to the category format (`special-event`). Media search also matches tags.
- **Members' own profile.** Members edit their own skills and interests on their profile.
- **F051, first and last names.** Staff can edit first and last names. Initials use them when both are set.
- **Dates.** Calendar dates, including the last-activity service date, render as their UTC day.
- **Analytics.**
  - The engagement weights and help text come from `ENGAGEMENT_WEIGHTS`.
  - The `/analytics` headings form a flat outline.
  - The attendance tab shows a busy state while it reloads.
  - The services tile offers Retry when its request fails.
- **E2E.**
  - The attendance flow picks the most recent day within the last 14 days that has no Sunday service. It checks the refreshed scores on the member's Church Info tab against the trends snapshot.
  - It runs axe on Church Info and on the delete dialog, and deletes the service through the UI.
  - The suite passes twice in a row and leaves no services or attendance behind.
- **Migration test.** The whole-chain test pins the checksums of the two Phase 2 migrations and compares the enum labels.

### 7.2 Accepted limits
- **Month in component state.** The month shown on `/services` is not in the URL.
- **100 services per month.** A month lists at most 100 services, with a note saying so.
- **2000 members per save.** Marking more than 2000 never-recorded members present in one save is refused by the API's batch limit.

## 8. Final pre-merge review (2026-10-07)
A last five-lens review of the whole PR on its final head covered deploy and operations, security, migrations, docs accuracy and Phase 1 and 2 regressions, with a verifier per finding. It confirmed 44 findings and refuted 2, none blocking.

### 8.1 Rulings applied in code
- **H1 No-admin stop.** The relations migration still stops when notes point at a deleted author and there is no admin, and its message now gives the full recovery: an admin, `prisma migrate resolve --rolled-back`, deploy again.
- **H2 to H7 Migrations.**
  - List values that do not convert are recorded in `phase3_archive.value_changes`.
  - The family pair collapse prefers an active row and never revives an inactive relationship.
  - Enum normalisation trims every whitespace character.
  - Engagement archive rows carry the userId.
  - Legacy media tags are normalised to the tag form.
  - The original values of every merged row are archived.
- **H8 Self projection.** Members reading or updating their own record get the self projection, without engagement, stage or risk.
- **H9 Unicode.** Text inputs reject lone UTF-16 surrogates like U+0000.
- **H10 Saved searches.** The saved-search list shows its creator to staff only.
- **H11 Service dates.** Service dates are limited to the years 1900 to 2100.
- **H12 CI naming.** The CI end-to-end job and the attendance spec comments describe what they really do.

### 8.2 Accepted and recorded
- **Active accounts only.** `GET /api/analytics/members` counts active accounts only for every figure: the totals, the distributions, the averages and the top-engaged list.
- **Month definitions.** "New this month" uses the UTC month, from the server. "Services this month" uses the viewer's local month, which matches the services page.
- **Free-text meeting day.** `Group.meetingDay` stays free text.
- **Tag search.** Media tag search collects matching ids in SQL first. This is fine at a church library's size.
- **Refresh CLI configuration.** The CLI loads the full API configuration, `JWT_SECRET` included, so it behaves like the server.
- **Docker images.** CI does not build the images. That belongs to Phase 4, the platform upgrades.
- **Single API instance.** The refresh job status is kept in memory, so the API runs as one instance. The README says so.
- **Groups and interactions.** Group memberships and interactions cannot be recorded in the app yet. Until those Phase 5 features arrive, the community score is 0 and communication is 50 for most members. The README says so.

