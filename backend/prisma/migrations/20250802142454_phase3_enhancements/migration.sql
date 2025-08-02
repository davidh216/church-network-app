-- CreateTable
CREATE TABLE "family_relationships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "primaryUserId" TEXT NOT NULL,
    "relatedUserId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "familyId" TEXT NOT NULL,
    CONSTRAINT "family_relationships_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "family_relationships_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "family_relationships_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lifecycle_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerCondition" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionData" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "timeline_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "activityDate" DATETIME NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL DEFAULT 'medium',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timeline_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_families" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyName" TEXT NOT NULL,
    "headOfFamily" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "familyEngagementScore" REAL NOT NULL DEFAULT 0,
    "lastCalculated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMembers" INTEGER NOT NULL DEFAULT 0,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_families" ("address", "city", "country", "createdAt", "familyName", "headOfFamily", "id", "state", "updatedAt", "zipCode") SELECT "address", "city", "country", "createdAt", "familyName", "headOfFamily", "id", "state", "updatedAt", "zipCode" FROM "families";
DROP TABLE "families";
ALTER TABLE "new_families" RENAME TO "families";
CREATE TABLE "new_member_engagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "engagementScore" REAL NOT NULL DEFAULT 0,
    "lastCalculated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendanceScore" REAL NOT NULL DEFAULT 0,
    "givingScore" REAL NOT NULL DEFAULT 0,
    "volunteerScore" REAL NOT NULL DEFAULT 0,
    "communityScore" REAL NOT NULL DEFAULT 0,
    "communicationScore" REAL NOT NULL DEFAULT 0,
    "servicesAttended" INTEGER NOT NULL DEFAULT 0,
    "eventsAttended" INTEGER NOT NULL DEFAULT 0,
    "volunteerHours" REAL NOT NULL DEFAULT 0,
    "donationCount" INTEGER NOT NULL DEFAULT 0,
    "groupMeetings" INTEGER NOT NULL DEFAULT 0,
    "membershipStage" TEXT NOT NULL DEFAULT 'visitor',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "lastActivity" DATETIME,
    "stageTransitionDate" DATETIME,
    "nextReviewDate" DATETIME,
    "automationTriggers" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "member_engagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_member_engagement" ("attendanceScore", "communicationScore", "communityScore", "createdAt", "donationCount", "engagementScore", "eventsAttended", "givingScore", "groupMeetings", "id", "lastActivity", "lastCalculated", "membershipStage", "riskLevel", "servicesAttended", "updatedAt", "userId", "volunteerHours", "volunteerScore") SELECT "attendanceScore", "communicationScore", "communityScore", "createdAt", "donationCount", "engagementScore", "eventsAttended", "givingScore", "groupMeetings", "id", "lastActivity", "lastCalculated", "membershipStage", "riskLevel", "servicesAttended", "updatedAt", "userId", "volunteerHours", "volunteerScore" FROM "member_engagement";
DROP TABLE "member_engagement";
ALTER TABLE "new_member_engagement" RENAME TO "member_engagement";
CREATE UNIQUE INDEX "member_engagement_userId_key" ON "member_engagement"("userId");
CREATE TABLE "new_member_interactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT,
    "staffMemberId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "responseRequired" BOOLEAN NOT NULL DEFAULT false,
    "responseReceived" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "responseTime" INTEGER,
    "scheduledFor" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_member_interactions" ("channel", "completedAt", "content", "createdAt", "id", "interactionType", "metadata", "responseTime", "scheduledFor", "staffMemberId", "status", "subject", "userId") SELECT "channel", "completedAt", "content", "createdAt", "id", "interactionType", "metadata", "responseTime", "scheduledFor", "staffMemberId", "status", "subject", "userId" FROM "member_interactions";
DROP TABLE "member_interactions";
ALTER TABLE "new_member_interactions" RENAME TO "member_interactions";
CREATE TABLE "new_member_milestones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "achievedDate" DATETIME NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "celebrated" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT 'general',
    "impact" TEXT NOT NULL DEFAULT 'medium',
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_milestones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_member_milestones" ("achievedDate", "celebrated", "createdAt", "description", "id", "isPublic", "milestoneType", "title", "userId") SELECT "achievedDate", "celebrated", "createdAt", "description", "id", "isPublic", "milestoneType", "title", "userId" FROM "member_milestones";
DROP TABLE "member_milestones";
ALTER TABLE "new_member_milestones" RENAME TO "member_milestones";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "family_relationships_primaryUserId_relatedUserId_relationshipType_key" ON "family_relationships"("primaryUserId", "relatedUserId", "relationshipType");
