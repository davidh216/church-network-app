-- P3-D6 (PHASE3_SPECS.md 1.5, decision P3-D3): engagement without giving and volunteer scores,
-- plus monthly engagement snapshots.
--
-- member_engagement loses givingScore and volunteerScore (no data source) and the counters that
-- only fed them or were never written: volunteerHours, donationCount and groupMeetings (always 0
-- since the D2 enum migration). Every row is kept; attendanceScore, communityScore,
-- communicationScore, engagementScore, membershipStage, riskLevel and the remaining counters keep
-- their stored values until the next refresh recomputes them under the new rules
-- (POST /api/analytics/members/engagement/refresh-all or `node dist/jobs/refresh-engagement.js`).
--
-- engagement_snapshots holds one row per member and month (first day of the month), written by
-- every refresh. It starts empty: no history is invented for months before this migration.

-- AlterTable
ALTER TABLE "member_engagement" DROP COLUMN "donationCount",
DROP COLUMN "givingScore",
DROP COLUMN "groupMeetings",
DROP COLUMN "volunteerHours",
DROP COLUMN "volunteerScore";

-- CreateTable
CREATE TABLE "engagement_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "attendanceScore" DOUBLE PRECISION NOT NULL,
    "communityScore" DOUBLE PRECISION NOT NULL,
    "communicationScore" DOUBLE PRECISION NOT NULL,
    "membershipStage" "MembershipStage" NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "engagement_snapshots_userId_month_key" ON "engagement_snapshots"("userId", "month");

-- AddForeignKey
ALTER TABLE "engagement_snapshots" ADD CONSTRAINT "engagement_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

