-- D2 (PHASE3_SPECS.md 1.1): the stringly-typed CRM columns become Postgres enums.
--
-- Values keep the lowercase snake_case strings already stored, so valid rows cast unchanged.
-- Every other stored value is first normalised (trimmed, lower-cased, runs of spaces and hyphens
-- turned into one underscore: 'co-leader' -> 'co_leader', 'Sunday Service' -> 'sunday_service').
-- A value that is still outside the list is mapped as below; no row is deleted for it.
--
--   column                                   unknown value becomes
--   users.gender                             'other' (blank -> NULL)
--   users.maritalStatus                      NULL
--   users.membershipType                     NULL
--   media.type                               'YOUTUBE_VIDEO' (any legacy IMAGE/VIDEO/AUDIO/DOCUMENT, decision P3-D5)
--   family_relationships.relationshipType    'other'
--   groups.type                              'ministry'
--   group_members.role                       'member'
--   attendance.serviceType                   'other'
--   member_engagement.membershipStage        'visitor' (the column default; recomputed on refresh)
--   member_engagement.riskLevel              'low' (the column default; recomputed on refresh)
--   member_activities.activityType           'other' (e.g. the legacy 'group_participation')
--   member_interactions.interactionType      'note_added'
--   member_interactions.channel              'in_person'
--   member_interactions.status               'completed' (the column default)
--   member_interactions.category             NULL
--   member_interactions.priority             'normal'
--   member_milestones.milestoneType          'other'
--   member_milestones.category               'general'
--   member_milestones.impact                 'medium'
--   member_notes.noteType                    'general'
--   member_tags.category                     'general'
--
-- Every stored value that is not a known spelling of a listed value (blank values excepted) is
-- recorded before it is mapped, in phase3_archive.value_changes (table, row id, column, old
-- value, new value). An attendance row whose serviceType was unknown also gets
-- 'Legacy service type: <original>' appended to its notes, so the label is not lost.
--
-- Two unique indexes include an enum column. Where normalising makes two rows identical under
-- them (attendance: same member, date and service type; family_relationships: same pair and
-- relationship type), the rows are collapsed into one before the cast: the row already holding
-- the canonical value (else the oldest) is kept, attendance keeps present = true if any of the
-- collapsed rows had it and its notes become the distinct non-blank notes of the collapsed rows
-- (trimmed, oldest first, joined by a newline), and a relationship stays active if any of them
-- was. Each deleted row is copied whole (as JSON) into phase3_archive.attendance or
-- phase3_archive.family_relationships first, and its id is listed by RAISE NOTICE.
--
-- Audit trail: the schema "phase3_archive" is not managed by Prisma (it is outside "public", so
-- it causes no drift). Every row this and the later Phase 3 migrations delete, repoint or remap
-- is recorded there with the source schema, the migration, a reason and archivedAt. It can be
-- dropped (DROP SCHEMA "phase3_archive" CASCADE) once the operator has checked it.

-- Normalisation helper, dropped at the end of this migration.
CREATE FUNCTION "phase3_enum_norm"(value TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT NULLIF(lower(regexp_replace(btrim(value), '[[:space:]-]+', '_', 'g')), '') $$;

-- CreateEnum
CREATE TYPE "MembershipStage" AS ENUM ('visitor', 'new_member', 'active_member', 'core_member', 'leader', 'at_risk', 'inactive');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('single', 'married', 'divorced', 'widowed', 'separated');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('member', 'visitor', 'regular_attendee', 'inactive');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('YOUTUBE_VIDEO');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other');

-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('ministry', 'small_group', 'committee', 'service_team');

-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('leader', 'co_leader', 'member');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('sunday_service', 'bible_study', 'prayer_meeting', 'special_event', 'other');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('email_sent', 'email_opened', 'sms_sent', 'sms_replied', 'call_made', 'visit_logged', 'note_added');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('email', 'sms', 'phone', 'in_person', 'social_media');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('scheduled', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "InteractionCategory" AS ENUM ('welcome', 'follow_up', 'pastoral_care', 'event_invitation', 'giving_reminder', 'volunteer_request');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('first_visit', 'baptism', 'confirmation', 'wedding', 'first_volunteer', 'leadership_role', 'anniversary', 'other');

-- CreateEnum
CREATE TYPE "MilestoneCategory" AS ENUM ('spiritual', 'service', 'family', 'personal', 'ministry', 'general');

-- CreateEnum
CREATE TYPE "Impact" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('general', 'pastoral_care', 'follow_up', 'prayer_request', 'concern');

-- CreateEnum
CREATE TYPE "TagCategory" AS ENUM ('ministry', 'demographic', 'interest', 'status', 'general');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('service_attendance', 'event_attendance', 'donation', 'volunteer', 'ministry_participation', 'communication_open', 'profile_update', 'other');

-- Audit trail (see the header). IF NOT EXISTS throughout: the schema survives a reset of "public".
CREATE SCHEMA IF NOT EXISTS "phase3_archive";
CREATE TABLE IF NOT EXISTS "phase3_archive"."value_changes" (
  "sourceSchema" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "columnName" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "phase3_archive"."attendance" (
  "sourceSchema" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "row" JSONB NOT NULL,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "phase3_archive"."family_relationships" (
  "sourceSchema" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "row" JSONB NOT NULL,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Records the rows of tbl whose col holds a non-blank value that does not normalise to one of
-- allowed (normalised spellings); they are about to be mapped to fallback. Dropped at the end.
CREATE FUNCTION "phase3_record_enum_fallback"(tbl TEXT, col TEXT, allowed TEXT[], fallback TEXT)
  RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO "phase3_archive"."value_changes"
       ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
     SELECT current_schema(), %L, "id", %L, %I, %L, %L, %L FROM %I
     WHERE "phase3_enum_norm"(%I) IS NOT NULL AND "phase3_enum_norm"(%I) <> ALL (%L::TEXT[])',
    tbl, col, col, fallback, '20261006010000_enum_columns',
    'unknown ' || col || ' value mapped to the fallback', tbl, col, col, allowed);
END;
$$;

-- attendance.serviceType: record unknown values (all rows, collapsed ones included).
SELECT "phase3_record_enum_fallback"('attendance', 'serviceType',
  ARRAY['sunday_service', 'bible_study', 'prayer_meeting', 'special_event', 'other'], 'other');

-- Collapse rows that normalising would make duplicates under the unique indexes.
DO $$
DECLARE
  ids TEXT;
BEGIN
  CREATE TEMP TABLE "phase3_attendance_rank" ON COMMIT DROP AS
    SELECT "id", "userId", "serviceDate", canon,
           row_number() OVER w AS rn,
           first_value("id") OVER w AS kept_id,
           count(*) OVER g AS group_size,
           bool_or("present") OVER g AS any_present
    FROM (
      SELECT *, CASE WHEN "phase3_enum_norm"("serviceType") IN ('sunday_service', 'bible_study', 'prayer_meeting', 'special_event', 'other')
                     THEN "phase3_enum_norm"("serviceType") ELSE 'other' END AS canon
      FROM "attendance"
    ) a
    WINDOW g AS (PARTITION BY "userId", "serviceDate", canon),
           w AS (PARTITION BY "userId", "serviceDate", canon
                 ORDER BY ("serviceType" = canon) DESC, "createdAt", "id");

  INSERT INTO "phase3_archive"."attendance" ("sourceSchema", "id", "row", "migration", "reason")
    SELECT current_schema(), a."id", to_jsonb(a), '20261006010000_enum_columns',
           'collapsed into attendance row ' || r.kept_id || ' (same member, time and service type)'
    FROM "attendance" a JOIN "phase3_attendance_rank" r ON r."id" = a."id" AND r.rn > 1;

  -- Keep the legacy label of an unknown service type before it becomes 'other'.
  UPDATE "attendance" SET "notes" =
      CASE WHEN "notes" IS NULL OR btrim("notes") = '' THEN '' ELSE btrim("notes") || E'\n' END
      || 'Legacy service type: ' || btrim("serviceType")
    WHERE "phase3_enum_norm"("serviceType") IS NOT NULL
      AND "phase3_enum_norm"("serviceType") NOT IN ('sunday_service', 'bible_study', 'prayer_meeting', 'special_event', 'other');

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "phase3_attendance_rank" WHERE rn > 1;
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'attendance rows collapsed (deleted, copied to phase3_archive.attendance): %', ids;
  END IF;

  UPDATE "attendance" AS a
  SET "present" = r.any_present,
      "notes" = CASE WHEN r.group_size = 1 THEN a."notes" ELSE (
        SELECT string_agg(n.note, E'\n' ORDER BY n.first_at, n.note)
        FROM (
          SELECT btrim(d."notes") AS note, min(d."createdAt") AS first_at
          FROM "attendance" AS d JOIN "phase3_attendance_rank" AS dr ON dr."id" = d."id"
          WHERE dr."userId" = r."userId" AND dr."serviceDate" = r."serviceDate" AND dr.canon = r.canon
            AND d."notes" IS NOT NULL AND btrim(d."notes") <> ''
          GROUP BY btrim(d."notes")
        ) AS n
      ) END
  FROM "phase3_attendance_rank" AS r
  WHERE a."id" = r."id" AND r.rn = 1;

  DELETE FROM "attendance" AS a USING "phase3_attendance_rank" AS r
    WHERE a."id" = r."id" AND r.rn > 1;

  DROP TABLE "phase3_attendance_rank";

  CREATE TEMP TABLE "phase3_relationship_rank" ON COMMIT DROP AS
    SELECT "id",
           row_number() OVER w AS rn,
           first_value("id") OVER w AS kept_id,
           bool_or("isActive") OVER (PARTITION BY "primaryUserId", "relatedUserId", canon) AS any_active
    FROM (
      SELECT *, CASE WHEN "phase3_enum_norm"("relationshipType") IN ('spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other')
                     THEN "phase3_enum_norm"("relationshipType") ELSE 'other' END AS canon
      FROM "family_relationships"
    ) r
    WINDOW w AS (PARTITION BY "primaryUserId", "relatedUserId", canon
                 ORDER BY ("relationshipType" = canon) DESC, "createdAt", "id");

  INSERT INTO "phase3_archive"."family_relationships" ("sourceSchema", "id", "row", "migration", "reason")
    SELECT current_schema(), f."id", to_jsonb(f), '20261006010000_enum_columns',
           'collapsed into family_relationships row ' || r.kept_id || ' (same pair and type)'
    FROM "family_relationships" f JOIN "phase3_relationship_rank" r ON r."id" = f."id" AND r.rn > 1;

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "phase3_relationship_rank" WHERE rn > 1;
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'family_relationships rows collapsed (deleted, copied to phase3_archive.family_relationships): %', ids;
  END IF;

  UPDATE "family_relationships" AS f SET "isActive" = r.any_active
    FROM "phase3_relationship_rank" AS r WHERE f."id" = r."id" AND r.rn = 1;
  DELETE FROM "family_relationships" AS f USING "phase3_relationship_rank" AS r
    WHERE f."id" = r."id" AND r.rn > 1;

  DROP TABLE "phase3_relationship_rank";
END $$;

-- users.gender -> Gender
SELECT "phase3_record_enum_fallback"('users', 'gender', ARRAY['male', 'female', 'other', 'prefer_not_to_say'], 'other');
UPDATE "users" SET "gender" = "phase3_enum_norm"("gender") WHERE "gender" IS DISTINCT FROM "phase3_enum_norm"("gender");
UPDATE "users" SET "gender" = 'other' WHERE "gender" IS NOT NULL AND "gender" NOT IN ('male', 'female', 'other', 'prefer_not_to_say');
ALTER TABLE "users" ALTER COLUMN "gender" TYPE "Gender" USING ("gender"::"Gender");

-- users.maritalStatus -> MaritalStatus
SELECT "phase3_record_enum_fallback"('users', 'maritalStatus', ARRAY['single', 'married', 'divorced', 'widowed', 'separated'], NULL);
UPDATE "users" SET "maritalStatus" = "phase3_enum_norm"("maritalStatus") WHERE "maritalStatus" IS DISTINCT FROM "phase3_enum_norm"("maritalStatus");
UPDATE "users" SET "maritalStatus" = NULL WHERE "maritalStatus" IS NOT NULL AND "maritalStatus" NOT IN ('single', 'married', 'divorced', 'widowed', 'separated');
ALTER TABLE "users" ALTER COLUMN "maritalStatus" TYPE "MaritalStatus" USING ("maritalStatus"::"MaritalStatus");

-- users.membershipType -> MembershipType
SELECT "phase3_record_enum_fallback"('users', 'membershipType', ARRAY['member', 'visitor', 'regular_attendee', 'inactive'], NULL);
UPDATE "users" SET "membershipType" = "phase3_enum_norm"("membershipType") WHERE "membershipType" IS DISTINCT FROM "phase3_enum_norm"("membershipType");
UPDATE "users" SET "membershipType" = NULL WHERE "membershipType" IS NOT NULL AND "membershipType" NOT IN ('member', 'visitor', 'regular_attendee', 'inactive');
ALTER TABLE "users" ALTER COLUMN "membershipType" TYPE "MembershipType" USING ("membershipType"::"MembershipType");

-- media.type -> MediaType
SELECT "phase3_record_enum_fallback"('media', 'type', ARRAY['youtube_video'], 'YOUTUBE_VIDEO');
UPDATE "media" SET "type" = 'YOUTUBE_VIDEO' WHERE "type" IS DISTINCT FROM 'YOUTUBE_VIDEO';
ALTER TABLE "media" ALTER COLUMN "type" TYPE "MediaType" USING ("type"::"MediaType");

-- family_relationships.relationshipType -> RelationshipType
SELECT "phase3_record_enum_fallback"('family_relationships', 'relationshipType', ARRAY['spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other'], 'other');
UPDATE "family_relationships" SET "relationshipType" = COALESCE("phase3_enum_norm"("relationshipType"), 'other') WHERE "relationshipType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("relationshipType"), 'other');
UPDATE "family_relationships" SET "relationshipType" = 'other' WHERE "relationshipType" NOT IN ('spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other');
ALTER TABLE "family_relationships" ALTER COLUMN "relationshipType" TYPE "RelationshipType" USING ("relationshipType"::"RelationshipType");

-- groups.type -> GroupType
SELECT "phase3_record_enum_fallback"('groups', 'type', ARRAY['ministry', 'small_group', 'committee', 'service_team'], 'ministry');
UPDATE "groups" SET "type" = COALESCE("phase3_enum_norm"("type"), 'ministry') WHERE "type" IS DISTINCT FROM COALESCE("phase3_enum_norm"("type"), 'ministry');
UPDATE "groups" SET "type" = 'ministry' WHERE "type" NOT IN ('ministry', 'small_group', 'committee', 'service_team');
ALTER TABLE "groups" ALTER COLUMN "type" TYPE "GroupType" USING ("type"::"GroupType");

-- group_members.role -> GroupMemberRole
SELECT "phase3_record_enum_fallback"('group_members', 'role', ARRAY['leader', 'co_leader', 'member'], 'member');
UPDATE "group_members" SET "role" = COALESCE("phase3_enum_norm"("role"), 'member') WHERE "role" IS DISTINCT FROM COALESCE("phase3_enum_norm"("role"), 'member');
UPDATE "group_members" SET "role" = 'member' WHERE "role" NOT IN ('leader', 'co_leader', 'member');
ALTER TABLE "group_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "group_members" ALTER COLUMN "role" TYPE "GroupMemberRole" USING ("role"::"GroupMemberRole");
ALTER TABLE "group_members" ALTER COLUMN "role" SET DEFAULT 'member';

-- attendance.serviceType -> ServiceType
UPDATE "attendance" SET "serviceType" = COALESCE("phase3_enum_norm"("serviceType"), 'other') WHERE "serviceType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("serviceType"), 'other');
UPDATE "attendance" SET "serviceType" = 'other' WHERE "serviceType" NOT IN ('sunday_service', 'bible_study', 'prayer_meeting', 'special_event', 'other');
ALTER TABLE "attendance" ALTER COLUMN "serviceType" DROP DEFAULT;
ALTER TABLE "attendance" ALTER COLUMN "serviceType" TYPE "ServiceType" USING ("serviceType"::"ServiceType");
ALTER TABLE "attendance" ALTER COLUMN "serviceType" SET DEFAULT 'sunday_service';

-- member_engagement.membershipStage -> MembershipStage
SELECT "phase3_record_enum_fallback"('member_engagement', 'membershipStage', ARRAY['visitor', 'new_member', 'active_member', 'core_member', 'leader', 'at_risk', 'inactive'], 'visitor');
UPDATE "member_engagement" SET "membershipStage" = COALESCE("phase3_enum_norm"("membershipStage"), 'visitor') WHERE "membershipStage" IS DISTINCT FROM COALESCE("phase3_enum_norm"("membershipStage"), 'visitor');
UPDATE "member_engagement" SET "membershipStage" = 'visitor' WHERE "membershipStage" NOT IN ('visitor', 'new_member', 'active_member', 'core_member', 'leader', 'at_risk', 'inactive');
ALTER TABLE "member_engagement" ALTER COLUMN "membershipStage" DROP DEFAULT;
ALTER TABLE "member_engagement" ALTER COLUMN "membershipStage" TYPE "MembershipStage" USING ("membershipStage"::"MembershipStage");
ALTER TABLE "member_engagement" ALTER COLUMN "membershipStage" SET DEFAULT 'visitor';

-- member_engagement.riskLevel -> RiskLevel
SELECT "phase3_record_enum_fallback"('member_engagement', 'riskLevel', ARRAY['low', 'medium', 'high'], 'low');
UPDATE "member_engagement" SET "riskLevel" = COALESCE("phase3_enum_norm"("riskLevel"), 'low') WHERE "riskLevel" IS DISTINCT FROM COALESCE("phase3_enum_norm"("riskLevel"), 'low');
UPDATE "member_engagement" SET "riskLevel" = 'low' WHERE "riskLevel" NOT IN ('low', 'medium', 'high');
ALTER TABLE "member_engagement" ALTER COLUMN "riskLevel" DROP DEFAULT;
ALTER TABLE "member_engagement" ALTER COLUMN "riskLevel" TYPE "RiskLevel" USING ("riskLevel"::"RiskLevel");
ALTER TABLE "member_engagement" ALTER COLUMN "riskLevel" SET DEFAULT 'low';

-- member_activities.activityType -> ActivityType
SELECT "phase3_record_enum_fallback"('member_activities', 'activityType', ARRAY['service_attendance', 'event_attendance', 'donation', 'volunteer', 'ministry_participation', 'communication_open', 'profile_update', 'other'], 'other');
UPDATE "member_activities" SET "activityType" = COALESCE("phase3_enum_norm"("activityType"), 'other') WHERE "activityType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("activityType"), 'other');
UPDATE "member_activities" SET "activityType" = 'other' WHERE "activityType" NOT IN ('service_attendance', 'event_attendance', 'donation', 'volunteer', 'ministry_participation', 'communication_open', 'profile_update', 'other');
ALTER TABLE "member_activities" ALTER COLUMN "activityType" TYPE "ActivityType" USING ("activityType"::"ActivityType");

-- member_interactions.interactionType -> InteractionType
SELECT "phase3_record_enum_fallback"('member_interactions', 'interactionType', ARRAY['email_sent', 'email_opened', 'sms_sent', 'sms_replied', 'call_made', 'visit_logged', 'note_added'], 'note_added');
UPDATE "member_interactions" SET "interactionType" = COALESCE("phase3_enum_norm"("interactionType"), 'note_added') WHERE "interactionType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("interactionType"), 'note_added');
UPDATE "member_interactions" SET "interactionType" = 'note_added' WHERE "interactionType" NOT IN ('email_sent', 'email_opened', 'sms_sent', 'sms_replied', 'call_made', 'visit_logged', 'note_added');
ALTER TABLE "member_interactions" ALTER COLUMN "interactionType" TYPE "InteractionType" USING ("interactionType"::"InteractionType");

-- member_interactions.channel -> Channel
SELECT "phase3_record_enum_fallback"('member_interactions', 'channel', ARRAY['email', 'sms', 'phone', 'in_person', 'social_media'], 'in_person');
UPDATE "member_interactions" SET "channel" = COALESCE("phase3_enum_norm"("channel"), 'in_person') WHERE "channel" IS DISTINCT FROM COALESCE("phase3_enum_norm"("channel"), 'in_person');
UPDATE "member_interactions" SET "channel" = 'in_person' WHERE "channel" NOT IN ('email', 'sms', 'phone', 'in_person', 'social_media');
ALTER TABLE "member_interactions" ALTER COLUMN "channel" TYPE "Channel" USING ("channel"::"Channel");

-- member_interactions.status -> InteractionStatus
SELECT "phase3_record_enum_fallback"('member_interactions', 'status', ARRAY['scheduled', 'completed', 'failed'], 'completed');
UPDATE "member_interactions" SET "status" = COALESCE("phase3_enum_norm"("status"), 'completed') WHERE "status" IS DISTINCT FROM COALESCE("phase3_enum_norm"("status"), 'completed');
UPDATE "member_interactions" SET "status" = 'completed' WHERE "status" NOT IN ('scheduled', 'completed', 'failed');
ALTER TABLE "member_interactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "member_interactions" ALTER COLUMN "status" TYPE "InteractionStatus" USING ("status"::"InteractionStatus");
ALTER TABLE "member_interactions" ALTER COLUMN "status" SET DEFAULT 'completed';

-- member_interactions.category -> InteractionCategory
SELECT "phase3_record_enum_fallback"('member_interactions', 'category', ARRAY['welcome', 'follow_up', 'pastoral_care', 'event_invitation', 'giving_reminder', 'volunteer_request'], NULL);
UPDATE "member_interactions" SET "category" = "phase3_enum_norm"("category") WHERE "category" IS DISTINCT FROM "phase3_enum_norm"("category");
UPDATE "member_interactions" SET "category" = NULL WHERE "category" IS NOT NULL AND "category" NOT IN ('welcome', 'follow_up', 'pastoral_care', 'event_invitation', 'giving_reminder', 'volunteer_request');
ALTER TABLE "member_interactions" ALTER COLUMN "category" TYPE "InteractionCategory" USING ("category"::"InteractionCategory");

-- member_interactions.priority -> Priority
SELECT "phase3_record_enum_fallback"('member_interactions', 'priority', ARRAY['low', 'normal', 'high', 'urgent'], 'normal');
UPDATE "member_interactions" SET "priority" = COALESCE("phase3_enum_norm"("priority"), 'normal') WHERE "priority" IS DISTINCT FROM COALESCE("phase3_enum_norm"("priority"), 'normal');
UPDATE "member_interactions" SET "priority" = 'normal' WHERE "priority" NOT IN ('low', 'normal', 'high', 'urgent');
ALTER TABLE "member_interactions" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "member_interactions" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::"Priority");
ALTER TABLE "member_interactions" ALTER COLUMN "priority" SET DEFAULT 'normal';

-- member_milestones.milestoneType -> MilestoneType
SELECT "phase3_record_enum_fallback"('member_milestones', 'milestoneType', ARRAY['first_visit', 'baptism', 'confirmation', 'wedding', 'first_volunteer', 'leadership_role', 'anniversary', 'other'], 'other');
UPDATE "member_milestones" SET "milestoneType" = COALESCE("phase3_enum_norm"("milestoneType"), 'other') WHERE "milestoneType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("milestoneType"), 'other');
UPDATE "member_milestones" SET "milestoneType" = 'other' WHERE "milestoneType" NOT IN ('first_visit', 'baptism', 'confirmation', 'wedding', 'first_volunteer', 'leadership_role', 'anniversary', 'other');
ALTER TABLE "member_milestones" ALTER COLUMN "milestoneType" TYPE "MilestoneType" USING ("milestoneType"::"MilestoneType");

-- member_milestones.category -> MilestoneCategory
SELECT "phase3_record_enum_fallback"('member_milestones', 'category', ARRAY['spiritual', 'service', 'family', 'personal', 'ministry', 'general'], 'general');
UPDATE "member_milestones" SET "category" = COALESCE("phase3_enum_norm"("category"), 'general') WHERE "category" IS DISTINCT FROM COALESCE("phase3_enum_norm"("category"), 'general');
UPDATE "member_milestones" SET "category" = 'general' WHERE "category" NOT IN ('spiritual', 'service', 'family', 'personal', 'ministry', 'general');
ALTER TABLE "member_milestones" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "member_milestones" ALTER COLUMN "category" TYPE "MilestoneCategory" USING ("category"::"MilestoneCategory");
ALTER TABLE "member_milestones" ALTER COLUMN "category" SET DEFAULT 'general';

-- member_milestones.impact -> Impact
SELECT "phase3_record_enum_fallback"('member_milestones', 'impact', ARRAY['low', 'medium', 'high'], 'medium');
UPDATE "member_milestones" SET "impact" = COALESCE("phase3_enum_norm"("impact"), 'medium') WHERE "impact" IS DISTINCT FROM COALESCE("phase3_enum_norm"("impact"), 'medium');
UPDATE "member_milestones" SET "impact" = 'medium' WHERE "impact" NOT IN ('low', 'medium', 'high');
ALTER TABLE "member_milestones" ALTER COLUMN "impact" DROP DEFAULT;
ALTER TABLE "member_milestones" ALTER COLUMN "impact" TYPE "Impact" USING ("impact"::"Impact");
ALTER TABLE "member_milestones" ALTER COLUMN "impact" SET DEFAULT 'medium';

-- member_notes.noteType -> NoteType
SELECT "phase3_record_enum_fallback"('member_notes', 'noteType', ARRAY['general', 'pastoral_care', 'follow_up', 'prayer_request', 'concern'], 'general');
UPDATE "member_notes" SET "noteType" = COALESCE("phase3_enum_norm"("noteType"), 'general') WHERE "noteType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("noteType"), 'general');
UPDATE "member_notes" SET "noteType" = 'general' WHERE "noteType" NOT IN ('general', 'pastoral_care', 'follow_up', 'prayer_request', 'concern');
ALTER TABLE "member_notes" ALTER COLUMN "noteType" DROP DEFAULT;
ALTER TABLE "member_notes" ALTER COLUMN "noteType" TYPE "NoteType" USING ("noteType"::"NoteType");
ALTER TABLE "member_notes" ALTER COLUMN "noteType" SET DEFAULT 'general';

-- member_tags.category -> TagCategory
SELECT "phase3_record_enum_fallback"('member_tags', 'category', ARRAY['ministry', 'demographic', 'interest', 'status', 'general'], 'general');
UPDATE "member_tags" SET "category" = COALESCE("phase3_enum_norm"("category"), 'general') WHERE "category" IS DISTINCT FROM COALESCE("phase3_enum_norm"("category"), 'general');
UPDATE "member_tags" SET "category" = 'general' WHERE "category" NOT IN ('ministry', 'demographic', 'interest', 'status', 'general');
ALTER TABLE "member_tags" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "member_tags" ALTER COLUMN "category" TYPE "TagCategory" USING ("category"::"TagCategory");
ALTER TABLE "member_tags" ALTER COLUMN "category" SET DEFAULT 'general';

DROP FUNCTION "phase3_record_enum_fallback"(TEXT, TEXT, TEXT[], TEXT);
DROP FUNCTION "phase3_enum_norm"(TEXT);
