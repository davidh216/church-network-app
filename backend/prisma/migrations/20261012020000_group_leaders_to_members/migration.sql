-- G3 (PHASE5_SPECS.md 2, decision P5-D8): a group's leaders are its group_members rows with role
-- leader or co_leader, so groups."leaderId" is folded into the roster and dropped.
--
-- Destructive step: the column groups."leaderId" (and its index and foreign key) is dropped.
-- Before that, for each group with a "leaderId":
--   - no group_members row for that user: one is inserted with role leader (joinDate = the
--     group's createdAt, id = 'c' + 24 hex digits of md5, a valid cuid shape);
--   - a row with role member: it is raised to leader (its isActive is left as it is);
--   - a row with role leader or co_leader: it is left as it is.
-- Every original (group id, leaderId) pair is copied first into phase5_archive.group_leaders,
-- with the group's name and what was done to the roster. The schema phase5_archive is outside
-- Prisma's "public" schema; the operator may drop it once checked. Rows are tagged with the
-- schema the migration ran in, like the Phase 3 archive.

CREATE SCHEMA IF NOT EXISTS "phase5_archive";
CREATE TABLE IF NOT EXISTS "phase5_archive"."group_leaders" (
  "sourceSchema" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "groupName" TEXT NOT NULL,
  "leaderId" TEXT NOT NULL,
  "membership" TEXT NOT NULL,
  "migration" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Archive the pairs, with the roster change each one gets.
INSERT INTO "phase5_archive"."group_leaders"
  ("sourceSchema", "groupId", "groupName", "leaderId", "membership", "migration")
SELECT current_schema(), g."id", g."name", g."leaderId",
       CASE
         WHEN gm."id" IS NULL THEN 'inserted as leader'
         WHEN gm."role" = 'member' THEN 'raised from member to leader (row ' || gm."id" || ')'
         ELSE 'kept as ' || gm."role"::text || ' (row ' || gm."id" || ')'
       END,
       '20261012020000_group_leaders_to_members'
FROM "groups" g
LEFT JOIN "group_members" gm ON gm."groupId" = g."id" AND gm."userId" = g."leaderId"
WHERE g."leaderId" IS NOT NULL;

-- 2. Fold the leaders into the roster.
UPDATE "group_members" gm SET "role" = 'leader'
FROM "groups" g
WHERE gm."groupId" = g."id" AND gm."userId" = g."leaderId" AND gm."role" = 'member';

INSERT INTO "group_members" ("id", "userId", "groupId", "role", "joinDate", "isActive")
SELECT 'c' || substr(md5('group_leader:' || g."id" || ':' || g."leaderId"), 1, 24),
       g."leaderId", g."id", 'leader', g."createdAt", true
FROM "groups" g
WHERE g."leaderId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "group_members" gm WHERE gm."groupId" = g."id" AND gm."userId" = g."leaderId"
  );

-- 3. Drop the column.
-- DropForeignKey
ALTER TABLE "groups" DROP CONSTRAINT "groups_leaderId_fkey";

-- DropIndex
DROP INDEX "groups_leaderId_idx";

-- AlterTable
ALTER TABLE "groups" DROP COLUMN "leaderId";
