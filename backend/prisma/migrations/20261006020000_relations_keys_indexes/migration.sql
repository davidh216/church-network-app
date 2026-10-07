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
--   member_notes.authorId is repointed to the oldest admin, because notes keep a required author
--   (RESTRICT); when such notes exist and there is no admin the migration stops with an error,
--   because repointing to another account would show it private notes it never wrote. Its SQL is
--   rolled back, but Prisma records the migration as failed and refuses to deploy again until
--   told otherwise. Recovery: create an admin account (or give an existing account the admin
--   role), run `npx prisma migrate resolve --rolled-back 20261006020000_relations_keys_indexes`,
--   then deploy again;
--   saved_searches whose createdById names no user are deleted (their delete rule is CASCADE:
--   the owner is gone and nobody else can manage a private search).
-- Every changed reference is recorded (table, row id, column, old value, new value) in
-- phase3_archive.value_changes, every deleted row is copied whole (as JSON) into
-- phase3_archive.saved_searches or phase3_archive.family_relationships, and the ids are also
-- listed by RAISE NOTICE. The schema phase3_archive is outside Prisma's "public" schema and can be
-- dropped (DROP SCHEMA "phase3_archive" CASCADE) once the operator has checked it.
--
-- users.isHeadOfFamily is dropped; it is derived from families.headOfFamilyId from now on. Before
-- the drop, a family without a head takes the oldest member flagged isHeadOfFamily.
--
-- member_engagement: the surrogate "id" is dropped and "userId" (already unique) becomes the key.
--
-- family_relationships stores each pair once, with primaryUserId < relatedUserId, and from now on
-- relationshipType is the PRIMARY user's relation to the RELATED user (PHASE3_SPECS.md 1.2).
-- Legacy rows meant the opposite (the related user is the primary's <type>: the only legacy writer
-- stored (head of family, their child, 'child')), so every legacy row is first translated by
-- inverting its type (parent <-> child, grandparent <-> grandchild; spouse, sibling and other are
-- symmetric). Then rows stored the other way round are swapped and their type inverted again.
-- Mirrored rows that then name the same pair are collapsed: an active row wins, then the row
-- already stored in canonical order, then the oldest. The kept row keeps its own type and its own
-- isActive, so it is active exactly when some collapsed row was, and a type stated only by an
-- inactive row is never made active.

-- 1. Renames
ALTER TABLE "families" RENAME COLUMN "headOfFamily" TO "headOfFamilyId";
ALTER TABLE "saved_searches" RENAME COLUMN "createdBy" TO "createdById";
ALTER TABLE "user_tags" RENAME COLUMN "addedBy" TO "addedById";

-- Audit trail (see the header; the tables match those created by 20261006010000_enum_columns).
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
CREATE TABLE IF NOT EXISTS "phase3_archive"."saved_searches" (
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

-- Records, then applies, the change of a dangling reference col of tbl to new_value.
CREATE FUNCTION "phase3_repoint_dangling"(tbl TEXT, col TEXT, new_value TEXT, reason TEXT)
  RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  ids TEXT;
  dangling TEXT := format(
    '%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = %I.%I)', col, tbl, col);
BEGIN
  EXECUTE format('SELECT string_agg("id", '', '' ORDER BY "id") FROM %I WHERE %s', tbl, dangling)
    INTO ids;
  IF ids IS NULL THEN RETURN; END IF;
  RAISE NOTICE '%.% % (recorded in phase3_archive.value_changes): %', tbl, col, reason, ids;
  EXECUTE format(
    'INSERT INTO "phase3_archive"."value_changes"
       ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
     SELECT current_schema(), %L, "id", %L, %I, %L, %L, %L FROM %I WHERE %s',
    tbl, col, col, new_value, '20261006020000_relations_keys_indexes', reason, tbl, dangling);
  EXECUTE format('UPDATE %I SET %I = %L WHERE %s', tbl, col, new_value, dangling);
END;
$$;

-- 2. Dangling references
DO $$
DECLARE
  fallback TEXT;
  ids TEXT;
  dangling_notes BIGINT;
BEGIN
  PERFORM "phase3_repoint_dangling"('families', 'headOfFamilyId', NULL, 'set to NULL (user missing)');
  PERFORM "phase3_repoint_dangling"('groups', 'leaderId', NULL, 'set to NULL (user missing)');
  PERFORM "phase3_repoint_dangling"('member_interactions', 'staffMemberId', NULL, 'set to NULL (user missing)');
  PERFORM "phase3_repoint_dangling"('user_tags', 'addedById', NULL, 'set to NULL (user missing)');

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "saved_searches"
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "saved_searches"."createdById");
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'saved_searches deleted (owner missing, copied to phase3_archive.saved_searches): %', ids;
  END IF;
  INSERT INTO "phase3_archive"."saved_searches" ("sourceSchema", "id", "row", "migration", "reason")
    SELECT current_schema(), s."id", to_jsonb(s), '20261006020000_relations_keys_indexes', 'owner missing'
    FROM "saved_searches" s
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = s."createdById");
  DELETE FROM "saved_searches"
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "saved_searches"."createdById");

  SELECT u."id" INTO fallback FROM "users" u
    JOIN "user_roles" ur ON ur."userId" = u."id"
    JOIN "roles" r ON r."id" = ur."roleId" AND r."name" = 'admin'
    ORDER BY u."createdAt", u."id" LIMIT 1;
  SELECT count(*) INTO dangling_notes FROM "member_notes"
    WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "member_notes"."authorId");
  IF dangling_notes > 0 AND fallback IS NULL THEN
    RAISE EXCEPTION 'member_notes: % note(s) reference a missing author and there is no admin account to own them; create an admin account (or give an existing account the admin role), then run npx prisma migrate resolve --rolled-back 20261006020000_relations_keys_indexes and deploy again', dangling_notes;
  END IF;
  PERFORM "phase3_repoint_dangling"('member_notes', 'authorId', fallback, 'repointed to the oldest admin (author missing)');
END $$;

DROP FUNCTION "phase3_repoint_dangling"(TEXT, TEXT, TEXT, TEXT);

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

-- Legacy meaning -> spec meaning (see the header): invert every row's type.
UPDATE "family_relationships" SET "relationshipType" = CASE "relationshipType"
    WHEN 'parent' THEN 'child'::"RelationshipType"
    WHEN 'child' THEN 'parent'::"RelationshipType"
    WHEN 'grandparent' THEN 'grandchild'::"RelationshipType"
    WHEN 'grandchild' THEN 'grandparent'::"RelationshipType"
    ELSE "relationshipType"
  END
  WHERE "relationshipType" IN ('parent', 'child', 'grandparent', 'grandchild');

DO $$
DECLARE
  ids TEXT;
BEGIN
  CREATE TEMP TABLE "phase3_pair_rank" ON COMMIT DROP AS
    SELECT "id",
      row_number() OVER pair AS rn,
      first_value("id") OVER pair AS kept_id
    FROM "family_relationships"
    WINDOW pair AS (
      PARTITION BY LEAST("primaryUserId", "relatedUserId"), GREATEST("primaryUserId", "relatedUserId")
      ORDER BY "isActive" DESC, ("primaryUserId" <= "relatedUserId") DESC, "createdAt", "id"
    );

  SELECT string_agg(r."id", ', ' ORDER BY r."id") INTO ids FROM "phase3_pair_rank" r WHERE r.rn > 1;
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'family_relationships collapsed into their pair (deleted, copied to phase3_archive.family_relationships): %', ids;
  END IF;
  INSERT INTO "phase3_archive"."family_relationships" ("sourceSchema", "id", "row", "migration", "reason")
    SELECT current_schema(), fr."id", to_jsonb(fr), '20261006020000_relations_keys_indexes',
           'collapsed into family_relationships row ' || r.kept_id || ' (same pair; type already in the new meaning)'
    FROM "family_relationships" fr JOIN "phase3_pair_rank" r ON r."id" = fr."id" AND r.rn > 1;

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
