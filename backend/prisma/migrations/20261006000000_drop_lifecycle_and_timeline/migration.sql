-- Phase 3 D1 (decision D6): drop the lifecycle automation and stored timeline tables and the
-- unused automation and family analytics columns. Nothing in the API ever wrote these tables or
-- columns, so no data is carried forward; the member timeline is now computed from interactions,
-- milestones, notes and attendance (GET /api/member-details/:id/timeline).
-- DropForeignKey
ALTER TABLE "timeline_activities" DROP CONSTRAINT "timeline_activities_userId_fkey";

-- AlterTable
ALTER TABLE "families" DROP COLUMN "activeMembers",
DROP COLUMN "familyEngagementScore",
DROP COLUMN "lastCalculated",
DROP COLUMN "totalMembers";

-- AlterTable
ALTER TABLE "member_engagement" DROP COLUMN "automationTriggers",
DROP COLUMN "followUpDate",
DROP COLUMN "followUpRequired",
DROP COLUMN "nextReviewDate",
DROP COLUMN "stageTransitionDate";

-- DropTable
DROP TABLE "lifecycle_rules";

-- DropTable
DROP TABLE "timeline_activities";

