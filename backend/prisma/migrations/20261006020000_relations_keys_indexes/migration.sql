-- P3-D3 Relations, keys and indexes (PHASE3_SPECS.md 1.2).
--
-- Column renames (data kept):
--   families.headOfFamily  -> families.headOfFamilyId
--   saved_searches.createdBy -> saved_searches.createdById
--   user_tags.addedBy      -> user_tags.addedById
--
-- Dangling references (ids that name no user) are cleaned before the foreign keys are added:
--   families.headOfFamilyId, groups.leaderId, member_interactions.staffMemberId and
--   user_tags.addedById are set to NULL (their new delete rule is SET NULL);
--   member_notes.authorId is repointed to the oldest admin (the oldest user when there is no
--   admin), because notes keep a required author (RESTRICT);
--   saved_searches whose createdById names no user are deleted (their delete rule is CASCADE:
--   the owner is gone and nobody else can manage a private search).
-- Every repointed or deleted id is listed by RAISE NOTICE when the migration runs.
--
-- users.isHeadOfFamily is dropped; it is derived from families.headOfFamilyId from now on. Before
-- the drop, a family without a head takes the oldest member flagged isHeadOfFamily.
--
-- member_engagement: the surrogate "id" is dropped and "userId" (already unique) becomes the key.
--
-- family_relationships stores each pair once, with primaryUserId < relatedUserId, and
-- relationshipType is the primary's relation to the related user. Rows stored the other way round
-- are swapped and their type inverted (parent <-> child, grandparent <-> grandchild; spouse,
-- sibling and other are symmetric). Mirrored rows that then name the same pair are collapsed: the
-- row already stored in canonical order wins, else the oldest; the kept row stays active if any
-- collapsed row was active.

-- 1. Renames
ALTER TABLE "families" RENAME COLUMN "headOfFamily" TO "headOfFamilyId";
ALTER TABLE "saved_searches" RENAME COLUMN "createdBy" TO "createdById";
ALTER TABLE "user_tags" RENAME COLUMN "addedBy" TO "addedById";

-- 2. Dangling references
DO $$
DECLARE
  fallback TEXT;
  ids TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "families"
    WHERE "headOfFamilyId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "families"."headOfFamilyId");
  IF ids IS NOT NULL THEN RAISE NOTICE 'families.headOfFamilyId set to NULL: %', ids; END IF;
  UPDATE "families" SET "headOfFamilyId" = NULL
    WHERE "headOfFamilyId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "families"."headOfFamilyId");

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "groups"
    WHERE "leaderId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "groups"."leaderId");
  IF ids IS NOT NULL THEN RAISE NOTICE 'groups.leaderId set to NULL: %', ids; END IF;
  UPDATE "groups" SET "leaderId" = NULL
    WHERE "leaderId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "groups"."leaderId");

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "member_interactions"
    WHERE "staffMemberId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "member_interactions"."staffMemberId");
  IF ids IS NOT NULL THEN RAISE NOTICE 'member_interactions.staffMemberId set to NULL: %', ids; END IF;
  UPDATE "member_interactions" SET "staffMemberId" = NULL
    WHERE "staffMemberId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "member_interactions"."staffMemberId");

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "user_tags"
    WHERE "addedById" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "user_tags"."addedById");
  IF ids IS NOT NULL THEN RAISE NOTICE 'user_tags.addedById set to NULL: %', ids; END IF;
  UPDATE "user_tags" SET "addedById" = NULL
    WHERE "addedById" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "user_tags"."addedById");

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "saved_searches"
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "saved_searches"."createdById");
  IF ids IS NOT NULL THEN RAISE NOTICE 'saved_searches deleted (owner missing): %', ids; END IF;
  DELETE FROM "saved_searches"
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "saved_searches"."createdById");

  SELECT u."id" INTO fallback FROM "users" u
    JOIN "user_roles" ur ON ur."userId" = u."id"
    JOIN "roles" r ON r."id" = ur."roleId" AND r."name" = 'admin'
    ORDER BY u."createdAt", u."id" LIMIT 1;
  IF fallback IS NULL THEN
    SELECT u."id" INTO fallback FROM "users" u ORDER BY u."createdAt", u."id" LIMIT 1;
  END IF;
  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "member_notes"
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "member_notes"."authorId");
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'member_notes.authorId repointed to %: %', fallback, ids;
  END IF;
  UPDATE "member_notes" SET "authorId" = fallback
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "member_notes"."authorId");
END $$;

-- 3. Head of family: keep the flag's information before the column goes
UPDATE "families" f SET "headOfFamilyId" = (
    SELECT u."id" FROM "users" u
    WHERE u."familyId" = f."id" AND u."isHeadOfFamily"
    ORDER BY u."createdAt", u."id" LIMIT 1
  )
  WHERE f."headOfFamilyId" IS NULL
    AND EXISTS (SELECT 1 FROM "users" u WHERE u."familyId" = f."id" AND u."isHeadOfFamily");

ALTER TABLE "users" DROP COLUMN "isHeadOfFamily";

-- 4. member_engagement keyed by userId
DROP INDEX "member_engagement_userId_key";
ALTER TABLE "member_engagement" DROP CONSTRAINT "member_engagement_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "member_engagement_pkey" PRIMARY KEY ("userId");

-- 5. Family relationships: one row per pair, primaryUserId < relatedUserId
DROP INDEX "family_relationships_primaryUserId_relatedUserId_relationsh_key";

DO $$
DECLARE
  ids TEXT;
BEGIN
  CREATE TEMP TABLE "phase3_pair_rank" ON COMMIT DROP AS
    SELECT "id",
      row_number() OVER pair AS rn,
      bool_or("isActive") OVER (PARTITION BY LEAST("primaryUserId", "relatedUserId"),
                                             GREATEST("primaryUserId", "relatedUserId")) AS any_active
    FROM "family_relationships"
    WINDOW pair AS (
      PARTITION BY LEAST("primaryUserId", "relatedUserId"), GREATEST("primaryUserId", "relatedUserId")
      ORDER BY ("primaryUserId" <= "relatedUserId") DESC, "createdAt", "id"
    );

  SELECT string_agg(r."id", ', ' ORDER BY r."id") INTO ids FROM "phase3_pair_rank" r WHERE r.rn > 1;
  IF ids IS NOT NULL THEN RAISE NOTICE 'family_relationships collapsed into their pair: %', ids; END IF;

  UPDATE "family_relationships" fr SET "isActive" = r.any_active
    FROM "phase3_pair_rank" r WHERE r."id" = fr."id" AND r.rn = 1 AND fr."isActive" <> r.any_active;
  DELETE FROM "family_relationships" fr
    USING "phase3_pair_rank" r WHERE r."id" = fr."id" AND r.rn > 1;

  DROP TABLE "phase3_pair_rank";
END $$;

UPDATE "family_relationships" SET
  "primaryUserId" = "relatedUserId",
  "relatedUserId" = "primaryUserId",
  "relationshipType" = CASE "relationshipType"
    WHEN 'parent' THEN 'child'::"RelationshipType"
    WHEN 'child' THEN 'parent'::"RelationshipType"
    WHEN 'grandparent' THEN 'grandchild'::"RelationshipType"
    WHEN 'grandchild' THEN 'grandparent'::"RelationshipType"
    ELSE "relationshipType"
  END
  WHERE "primaryUserId" > "relatedUserId";

CREATE UNIQUE INDEX "family_relationships_primaryUserId_relatedUserId_key" ON "family_relationships"("primaryUserId", "relatedUserId");

-- 6. media.uploadedById becomes optional, SET NULL on delete
ALTER TABLE "media" DROP CONSTRAINT "media_uploadedById_fkey";
ALTER TABLE "media" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- 7. Indexes
CREATE INDEX "attendance_userId_idx" ON "attendance"("userId");
CREATE INDEX "families_headOfFamilyId_idx" ON "families"("headOfFamilyId");
CREATE INDEX "family_relationships_relatedUserId_idx" ON "family_relationships"("relatedUserId");
CREATE INDEX "family_relationships_familyId_idx" ON "family_relationships"("familyId");
CREATE INDEX "group_members_groupId_idx" ON "group_members"("groupId");
CREATE INDEX "groups_leaderId_idx" ON "groups"("leaderId");
CREATE INDEX "media_uploadedById_idx" ON "media"("uploadedById");
CREATE INDEX "media_createdAt_idx" ON "media"("createdAt");
CREATE INDEX "member_activities_userId_createdAt_idx" ON "member_activities"("userId", "createdAt");
CREATE INDEX "member_engagement_engagementScore_idx" ON "member_engagement"("engagementScore");
CREATE INDEX "member_engagement_membershipStage_idx" ON "member_engagement"("membershipStage");
CREATE INDEX "member_engagement_riskLevel_idx" ON "member_engagement"("riskLevel");
CREATE INDEX "member_interactions_userId_createdAt_idx" ON "member_interactions"("userId", "createdAt");
CREATE INDEX "member_interactions_staffMemberId_idx" ON "member_interactions"("staffMemberId");
CREATE INDEX "member_milestones_userId_achievedDate_idx" ON "member_milestones"("userId", "achievedDate");
CREATE INDEX "member_notes_userId_createdAt_idx" ON "member_notes"("userId", "createdAt");
CREATE INDEX "member_notes_authorId_idx" ON "member_notes"("authorId");
CREATE INDEX "saved_searches_createdById_idx" ON "saved_searches"("createdById");
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");
CREATE INDEX "user_tags_tagId_idx" ON "user_tags"("tagId");
CREATE INDEX "user_tags_addedById_idx" ON "user_tags"("addedById");
CREATE INDEX "users_familyId_idx" ON "users"("familyId");
CREATE INDEX "users_isActive_idx" ON "users"("isActive");
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");
CREATE INDEX "users_membershipDate_idx" ON "users"("membershipDate");

-- 8. Foreign keys
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "families" ADD CONSTRAINT "families_headOfFamilyId_fkey" FOREIGN KEY ("headOfFamilyId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "groups" ADD CONSTRAINT "groups_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_interactions" ADD CONSTRAINT "member_interactions_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
