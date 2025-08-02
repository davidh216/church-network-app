-- CreateTable
CREATE TABLE "member_engagement" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "member_engagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "member_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT,
    "metadata" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "member_interactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT,
    "staffMemberId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "metadata" TEXT,
    "responseTime" INTEGER,
    "scheduledFor" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "member_milestones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "achievedDate" DATETIME NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "celebrated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_milestones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "member_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'general',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "member_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "member_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedBy" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "member_tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "member_engagement_userId_key" ON "member_engagement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_tags_name_key" ON "member_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_tags_userId_tagId_key" ON "user_tags"("userId", "tagId");
