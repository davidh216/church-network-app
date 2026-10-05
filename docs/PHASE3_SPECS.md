# Phase 3 implementation specifications: data model and analytics correctness

Companion to `MODERNIZATION_GAMEPLAN.md` section 6, Phase 3. Written by the planner for the implementation agents (Claude Opus 5.5, medium effort). Status: DRAFT, awaiting owner approval. One stream (D) runs sequentially, one agent per item, on branch `modernize/phase-3` cut from `main` after Phases 0 to 2 are merged. The planner verifies and reviews after D1 to D6 (backend) and again after D7 to D8 (frontend and tests).

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
2. After D7 to D8: root checks plus Playwright with axe, review (accessibility, regressions, spec compliance), fixes, gameplan update, push, PR #4 into `main`.

## 4. Decisions (recommendations marked)
| Id | Decision | Options | Recommendation |
|---|---|---|---|
| P3-D1 | Stage and risk | Computed only (recommended); computed with a staff override field | Computed only; an override is a Phase 5 feature if staff ask for it |
| P3-D2 | Services and attendance UI | Minimal staff UI in Phase 3 (recommended); backend only, UI in Phase 5 | Include it: without a way to record attendance every score stays zero |
| P3-D3 | Giving and volunteer scores | Remove entirely (recommended, per D7); keep hidden columns | Remove; reintroduce with a real data source |
| P3-D4 | Engagement refresh scheduling | CLI job for cron plus on-demand endpoint (recommended); in-process nightly timer | CLI plus endpoint; no timers inside the API process |
| P3-D5 | Media types | Enum with `YOUTUBE_VIDEO` only (recommended); keep five values | Only what the app can play |

## 5. Estimates
D1 M, D2 L, D3 M, D4 M, D5 L, D6 L, D7 L, D8 M: about 10 to 12 days of agent time plus 2 planner days; roughly three weeks at the current cadence.
