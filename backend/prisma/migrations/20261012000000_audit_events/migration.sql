-- G1 (PHASE5_SPECS.md 2): the audit log. Adds the AuditAction enum with every 5A action and the
-- audit_events table; no existing data changes.
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('user_role_changed', 'user_activated', 'user_deactivated', 'user_password_reset_by_admin', 'tag_created', 'tag_updated', 'tag_archived', 'tag_deleted', 'tag_assigned', 'tag_unassigned', 'group_created', 'group_updated', 'group_archived', 'group_deleted', 'group_member_added', 'group_member_updated', 'group_member_removed', 'family_created', 'family_updated', 'family_deleted', 'family_member_added', 'family_member_removed', 'family_relationship_set', 'family_relationship_removed');

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "count" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorId_idx" ON "audit_events"("actorId");

-- CreateIndex
CREATE INDEX "audit_events_targetType_targetId_idx" ON "audit_events"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

