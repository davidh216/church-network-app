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
-- Two unique indexes include an enum column. Where normalising makes two rows identical under
-- them (attendance: same member, date and service type; family_relationships: same pair and
-- relationship type), the rows are collapsed into one before the cast: the row already holding
-- the canonical value (else the oldest) is kept, attendance keeps present = true if any of the
-- collapsed rows had it, and a relationship stays active if any of them was.

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

-- Collapse rows that normalising would make duplicates under the unique indexes.
WITH ranked AS (
  SELECT "id",
         row_number() OVER w AS rn,
         bool_or("present") OVER (PARTITION BY "userId", "serviceDate", canon) AS any_present
  FROM (
    SELECT *, CASE WHEN "phase3_enum_norm"("serviceType") IN ('sunday_service', 'bible_study', 'prayer_meeting', 'special_event', 'other')
                   THEN "phase3_enum_norm"("serviceType") ELSE 'other' END AS canon
    FROM "attendance"
  ) a
  WINDOW w AS (PARTITION BY "userId", "serviceDate", canon
               ORDER BY ("serviceType" = canon) DESC, "createdAt", "id")
), kept AS (
  UPDATE "attendance" SET "present" = ranked.any_present
  FROM ranked WHERE "attendance"."id" = ranked."id" AND ranked.rn = 1
  RETURNING "attendance"."id"
)
DELETE FROM "attendance" USING ranked
WHERE "attendance"."id" = ranked."id" AND ranked.rn > 1;

WITH ranked AS (
  SELECT "id",
         row_number() OVER w AS rn,
         bool_or("isActive") OVER (PARTITION BY "primaryUserId", "relatedUserId", canon) AS any_active
  FROM (
    SELECT *, CASE WHEN "phase3_enum_norm"("relationshipType") IN ('spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other')
                   THEN "phase3_enum_norm"("relationshipType") ELSE 'other' END AS canon
    FROM "family_relationships"
  ) r
  WINDOW w AS (PARTITION BY "primaryUserId", "relatedUserId", canon
               ORDER BY ("relationshipType" = canon) DESC, "createdAt", "id")
), kept AS (
  UPDATE "family_relationships" SET "isActive" = ranked.any_active
  FROM ranked WHERE "family_relationships"."id" = ranked."id" AND ranked.rn = 1
  RETURNING "family_relationships"."id"
)
DELETE FROM "family_relationships" USING ranked
WHERE "family_relationships"."id" = ranked."id" AND ranked.rn > 1;

-- users.gender -> Gender
UPDATE "users" SET "gender" = "phase3_enum_norm"("gender") WHERE "gender" IS DISTINCT FROM "phase3_enum_norm"("gender");
UPDATE "users" SET "gender" = 'other' WHERE "gender" IS NOT NULL AND "gender" NOT IN ('male', 'female', 'other', 'prefer_not_to_say');
ALTER TABLE "users" ALTER COLUMN "gender" TYPE "Gender" USING ("gender"::"Gender");

-- users.maritalStatus -> MaritalStatus
UPDATE "users" SET "maritalStatus" = "phase3_enum_norm"("maritalStatus") WHERE "maritalStatus" IS DISTINCT FROM "phase3_enum_norm"("maritalStatus");
UPDATE "users" SET "maritalStatus" = NULL WHERE "maritalStatus" IS NOT NULL AND "maritalStatus" NOT IN ('single', 'married', 'divorced', 'widowed', 'separated');
ALTER TABLE "users" ALTER COLUMN "maritalStatus" TYPE "MaritalStatus" USING ("maritalStatus"::"MaritalStatus");

-- users.membershipType -> MembershipType
UPDATE "users" SET "membershipType" = "phase3_enum_norm"("membershipType") WHERE "membershipType" IS DISTINCT FROM "phase3_enum_norm"("membershipType");
UPDATE "users" SET "membershipType" = NULL WHERE "membershipType" IS NOT NULL AND "membershipType" NOT IN ('member', 'visitor', 'regular_attendee', 'inactive');
ALTER TABLE "users" ALTER COLUMN "membershipType" TYPE "MembershipType" USING ("membershipType"::"MembershipType");

-- media.type -> MediaType
UPDATE "media" SET "type" = 'YOUTUBE_VIDEO' WHERE "type" IS DISTINCT FROM 'YOUTUBE_VIDEO';
ALTER TABLE "media" ALTER COLUMN "type" TYPE "MediaType" USING ("type"::"MediaType");

-- family_relationships.relationshipType -> RelationshipType
UPDATE "family_relationships" SET "relationshipType" = COALESCE("phase3_enum_norm"("relationshipType"), 'other') WHERE "relationshipType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("relationshipType"), 'other');
UPDATE "family_relationships" SET "relationshipType" = 'other' WHERE "relationshipType" NOT IN ('spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other');
ALTER TABLE "family_relationships" ALTER COLUMN "relationshipType" TYPE "RelationshipType" USING ("relationshipType"::"RelationshipType");

-- groups.type -> GroupType
UPDATE "groups" SET "type" = COALESCE("phase3_enum_norm"("type"), 'ministry') WHERE "type" IS DISTINCT FROM COALESCE("phase3_enum_norm"("type"), 'ministry');
UPDATE "groups" SET "type" = 'ministry' WHERE "type" NOT IN ('ministry', 'small_group', 'committee', 'service_team');
ALTER TABLE "groups" ALTER COLUMN "type" TYPE "GroupType" USING ("type"::"GroupType");

-- group_members.role -> GroupMemberRole
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
UPDATE "member_engagement" SET "membershipStage" = COALESCE("phase3_enum_norm"("membershipStage"), 'visitor') WHERE "membershipStage" IS DISTINCT FROM COALESCE("phase3_enum_norm"("membershipStage"), 'visitor');
UPDATE "member_engagement" SET "membershipStage" = 'visitor' WHERE "membershipStage" NOT IN ('visitor', 'new_member', 'active_member', 'core_member', 'leader', 'at_risk', 'inactive');
ALTER TABLE "member_engagement" ALTER COLUMN "membershipStage" DROP DEFAULT;
ALTER TABLE "member_engagement" ALTER COLUMN "membershipStage" TYPE "MembershipStage" USING ("membershipStage"::"MembershipStage");
ALTER TABLE "member_engagement" ALTER COLUMN "membershipStage" SET DEFAULT 'visitor';

-- member_engagement.riskLevel -> RiskLevel
UPDATE "member_engagement" SET "riskLevel" = COALESCE("phase3_enum_norm"("riskLevel"), 'low') WHERE "riskLevel" IS DISTINCT FROM COALESCE("phase3_enum_norm"("riskLevel"), 'low');
UPDATE "member_engagement" SET "riskLevel" = 'low' WHERE "riskLevel" NOT IN ('low', 'medium', 'high');
ALTER TABLE "member_engagement" ALTER COLUMN "riskLevel" DROP DEFAULT;
ALTER TABLE "member_engagement" ALTER COLUMN "riskLevel" TYPE "RiskLevel" USING ("riskLevel"::"RiskLevel");
ALTER TABLE "member_engagement" ALTER COLUMN "riskLevel" SET DEFAULT 'low';

-- member_activities.activityType -> ActivityType
UPDATE "member_activities" SET "activityType" = COALESCE("phase3_enum_norm"("activityType"), 'other') WHERE "activityType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("activityType"), 'other');
UPDATE "member_activities" SET "activityType" = 'other' WHERE "activityType" NOT IN ('service_attendance', 'event_attendance', 'donation', 'volunteer', 'ministry_participation', 'communication_open', 'profile_update', 'other');
ALTER TABLE "member_activities" ALTER COLUMN "activityType" TYPE "ActivityType" USING ("activityType"::"ActivityType");

-- member_interactions.interactionType -> InteractionType
UPDATE "member_interactions" SET "interactionType" = COALESCE("phase3_enum_norm"("interactionType"), 'note_added') WHERE "interactionType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("interactionType"), 'note_added');
UPDATE "member_interactions" SET "interactionType" = 'note_added' WHERE "interactionType" NOT IN ('email_sent', 'email_opened', 'sms_sent', 'sms_replied', 'call_made', 'visit_logged', 'note_added');
ALTER TABLE "member_interactions" ALTER COLUMN "interactionType" TYPE "InteractionType" USING ("interactionType"::"InteractionType");

-- member_interactions.channel -> Channel
UPDATE "member_interactions" SET "channel" = COALESCE("phase3_enum_norm"("channel"), 'in_person') WHERE "channel" IS DISTINCT FROM COALESCE("phase3_enum_norm"("channel"), 'in_person');
UPDATE "member_interactions" SET "channel" = 'in_person' WHERE "channel" NOT IN ('email', 'sms', 'phone', 'in_person', 'social_media');
ALTER TABLE "member_interactions" ALTER COLUMN "channel" TYPE "Channel" USING ("channel"::"Channel");

-- member_interactions.status -> InteractionStatus
UPDATE "member_interactions" SET "status" = COALESCE("phase3_enum_norm"("status"), 'completed') WHERE "status" IS DISTINCT FROM COALESCE("phase3_enum_norm"("status"), 'completed');
UPDATE "member_interactions" SET "status" = 'completed' WHERE "status" NOT IN ('scheduled', 'completed', 'failed');
ALTER TABLE "member_interactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "member_interactions" ALTER COLUMN "status" TYPE "InteractionStatus" USING ("status"::"InteractionStatus");
ALTER TABLE "member_interactions" ALTER COLUMN "status" SET DEFAULT 'completed';

-- member_interactions.category -> InteractionCategory
UPDATE "member_interactions" SET "category" = "phase3_enum_norm"("category") WHERE "category" IS DISTINCT FROM "phase3_enum_norm"("category");
UPDATE "member_interactions" SET "category" = NULL WHERE "category" IS NOT NULL AND "category" NOT IN ('welcome', 'follow_up', 'pastoral_care', 'event_invitation', 'giving_reminder', 'volunteer_request');
ALTER TABLE "member_interactions" ALTER COLUMN "category" TYPE "InteractionCategory" USING ("category"::"InteractionCategory");

-- member_interactions.priority -> Priority
UPDATE "member_interactions" SET "priority" = COALESCE("phase3_enum_norm"("priority"), 'normal') WHERE "priority" IS DISTINCT FROM COALESCE("phase3_enum_norm"("priority"), 'normal');
UPDATE "member_interactions" SET "priority" = 'normal' WHERE "priority" NOT IN ('low', 'normal', 'high', 'urgent');
ALTER TABLE "member_interactions" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "member_interactions" ALTER COLUMN "priority" TYPE "Priority" USING ("priority"::"Priority");
ALTER TABLE "member_interactions" ALTER COLUMN "priority" SET DEFAULT 'normal';

-- member_milestones.milestoneType -> MilestoneType
UPDATE "member_milestones" SET "milestoneType" = COALESCE("phase3_enum_norm"("milestoneType"), 'other') WHERE "milestoneType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("milestoneType"), 'other');
UPDATE "member_milestones" SET "milestoneType" = 'other' WHERE "milestoneType" NOT IN ('first_visit', 'baptism', 'confirmation', 'wedding', 'first_volunteer', 'leadership_role', 'anniversary', 'other');
ALTER TABLE "member_milestones" ALTER COLUMN "milestoneType" TYPE "MilestoneType" USING ("milestoneType"::"MilestoneType");

-- member_milestones.category -> MilestoneCategory
UPDATE "member_milestones" SET "category" = COALESCE("phase3_enum_norm"("category"), 'general') WHERE "category" IS DISTINCT FROM COALESCE("phase3_enum_norm"("category"), 'general');
UPDATE "member_milestones" SET "category" = 'general' WHERE "category" NOT IN ('spiritual', 'service', 'family', 'personal', 'ministry', 'general');
ALTER TABLE "member_milestones" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "member_milestones" ALTER COLUMN "category" TYPE "MilestoneCategory" USING ("category"::"MilestoneCategory");
ALTER TABLE "member_milestones" ALTER COLUMN "category" SET DEFAULT 'general';

-- member_milestones.impact -> Impact
UPDATE "member_milestones" SET "impact" = COALESCE("phase3_enum_norm"("impact"), 'medium') WHERE "impact" IS DISTINCT FROM COALESCE("phase3_enum_norm"("impact"), 'medium');
UPDATE "member_milestones" SET "impact" = 'medium' WHERE "impact" NOT IN ('low', 'medium', 'high');
ALTER TABLE "member_milestones" ALTER COLUMN "impact" DROP DEFAULT;
ALTER TABLE "member_milestones" ALTER COLUMN "impact" TYPE "Impact" USING ("impact"::"Impact");
ALTER TABLE "member_milestones" ALTER COLUMN "impact" SET DEFAULT 'medium';

-- member_notes.noteType -> NoteType
UPDATE "member_notes" SET "noteType" = COALESCE("phase3_enum_norm"("noteType"), 'general') WHERE "noteType" IS DISTINCT FROM COALESCE("phase3_enum_norm"("noteType"), 'general');
UPDATE "member_notes" SET "noteType" = 'general' WHERE "noteType" NOT IN ('general', 'pastoral_care', 'follow_up', 'prayer_request', 'concern');
ALTER TABLE "member_notes" ALTER COLUMN "noteType" DROP DEFAULT;
ALTER TABLE "member_notes" ALTER COLUMN "noteType" TYPE "NoteType" USING ("noteType"::"NoteType");
ALTER TABLE "member_notes" ALTER COLUMN "noteType" SET DEFAULT 'general';

-- member_tags.category -> TagCategory
UPDATE "member_tags" SET "category" = COALESCE("phase3_enum_norm"("category"), 'general') WHERE "category" IS DISTINCT FROM COALESCE("phase3_enum_norm"("category"), 'general');
UPDATE "member_tags" SET "category" = 'general' WHERE "category" NOT IN ('ministry', 'demographic', 'interest', 'status', 'general');
ALTER TABLE "member_tags" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "member_tags" ALTER COLUMN "category" TYPE "TagCategory" USING ("category"::"TagCategory");
ALTER TABLE "member_tags" ALTER COLUMN "category" SET DEFAULT 'general';

DROP FUNCTION "phase3_enum_norm"(TEXT);
