-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "maritalStatus" TEXT,
    "occupation" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "membershipDate" TIMESTAMP(3),
    "baptismDate" TIMESTAMP(3),
    "confirmationDate" TIMESTAMP(3),
    "membershipType" TEXT,
    "previousChurch" TEXT,
    "howHeardAboutUs" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "emailOptIn" BOOLEAN NOT NULL DEFAULT true,
    "smsOptIn" BOOLEAN NOT NULL DEFAULT false,
    "mailOptIn" BOOLEAN NOT NULL DEFAULT true,
    "familyId" TEXT,
    "isHeadOfFamily" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "lastAttended" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "volunteerSkills" TEXT,
    "interests" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "tags" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "headOfFamily" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "familyEngagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMembers" INTEGER NOT NULL DEFAULT 0,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_relationships" (
    "id" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "relatedUserId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "familyId" TEXT NOT NULL,

    CONSTRAINT "family_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "meetingDay" TEXT,
    "meetingTime" TEXT,
    "location" TEXT,
    "leaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'sunday_service',
    "present" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_engagement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "givingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volunteerScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "communityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "communicationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "servicesAttended" INTEGER NOT NULL DEFAULT 0,
    "eventsAttended" INTEGER NOT NULL DEFAULT 0,
    "volunteerHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "donationCount" INTEGER NOT NULL DEFAULT 0,
    "groupMeetings" INTEGER NOT NULL DEFAULT 0,
    "membershipStage" TEXT NOT NULL DEFAULT 'visitor',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "lastActivity" TIMESTAMP(3),
    "stageTransitionDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "automationTriggers" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerCondition" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionData" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lifecycle_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL DEFAULT 'medium',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT,
    "metadata" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_interactions" (
    "id" TEXT NOT NULL,
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
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_milestones" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "achievedDate" TIMESTAMP(3) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "celebrated" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT 'general',
    "impact" TEXT NOT NULL DEFAULT 'medium',
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'general',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedBy" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "query" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsed" TIMESTAMP(3),

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "family_relationships_primaryUserId_relatedUserId_relationsh_key" ON "family_relationships"("primaryUserId", "relatedUserId", "relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_userId_groupId_key" ON "group_members"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_userId_serviceDate_serviceType_key" ON "attendance"("userId", "serviceDate", "serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "member_engagement_userId_key" ON "member_engagement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_tags_name_key" ON "member_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_tags_userId_tagId_key" ON "user_tags"("userId", "tagId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_engagement" ADD CONSTRAINT "member_engagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_activities" ADD CONSTRAINT "timeline_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_activities" ADD CONSTRAINT "member_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_interactions" ADD CONSTRAINT "member_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_milestones" ADD CONSTRAINT "member_milestones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "member_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

