-- G4 (PHASE5_SPECS.md 2): family integrity before families become editable.
--
-- 1. family_relationships stores each pair once with "primaryUserId" < "relatedUserId" in byte
--    order (COLLATE "C", the order of JavaScript string comparison for these ASCII ids), and from
--    now on a CHECK constraint enforces it, which also rules out a pair of one user with themself.
--    Rows that break it are canonicalised the way 20261006020000_relations_keys_indexes did:
--      - a row pairing a user with themself is deleted;
--      - mirrored rows naming the same pair are collapsed: an active row wins, then the row
--        already stored in canonical order, then the oldest; the others are deleted;
--      - a remaining row stored the other way round is swapped, with its type inverted
--        (parent <-> child, grandparent <-> grandchild; spouse, sibling and other are symmetric),
--        so it states the same relationship.
--    Every deleted or swapped row is first copied whole (as JSON, before the change) into
--    phase5_archive.family_relationships with the reason.
--
-- 2. A family whose head is not one of its members is repaired:
--      - a head with no family joins this one (users."familyId" set; when they head several
--        families, the oldest one);
--      - otherwise (the head belongs to another family) families."headOfFamilyId" is set to NULL.
--    Each changed value is recorded (table, row id, column, old value, new value) in
--    phase5_archive.value_changes.
--
-- Destructive steps: the deleted family_relationships rows, and the cleared heads of family
-- (both archived as above). The schema phase5_archive is outside Prisma's "public" schema; the
-- operator may drop it once checked. Rows are tagged with the schema the migration ran in.

CREATE SCHEMA IF NOT EXISTS "phase5_archive";
CREATE TABLE IF NOT EXISTS "phase5_archive"."family_relationships" (
  "sourceSchema" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "row" JSONB NOT NULL,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "phase5_archive"."value_changes" (
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

-- 1a. A user paired with themself.
INSERT INTO "phase5_archive"."family_relationships" ("sourceSchema", "id", "row", "migration", "reason")
SELECT current_schema(), fr."id", to_jsonb(fr), '20261012030000_family_integrity',
       'deleted (a user paired with themself)'
FROM "family_relationships" fr
WHERE fr."primaryUserId" = fr."relatedUserId";

DELETE FROM "family_relationships" WHERE "primaryUserId" = "relatedUserId";

-- 1b. Mirrored rows naming the same pair: keep one.
CREATE TEMP TABLE "phase5_pair_rank" AS
  SELECT "id",
    row_number() OVER pair AS rn,
    first_value("id") OVER pair AS kept_id
  FROM "family_relationships"
  WINDOW pair AS (
    PARTITION BY LEAST("primaryUserId" COLLATE "C", "relatedUserId" COLLATE "C"),
                 GREATEST("primaryUserId" COLLATE "C", "relatedUserId" COLLATE "C")
    ORDER BY "isActive" DESC, ("primaryUserId" < "relatedUserId" COLLATE "C") DESC, "createdAt", "id"
  );

INSERT INTO "phase5_archive"."family_relationships" ("sourceSchema", "id", "row", "migration", "reason")
SELECT current_schema(), fr."id", to_jsonb(fr), '20261012030000_family_integrity',
       'collapsed into family_relationships row ' || r.kept_id || ' (same pair)'
FROM "family_relationships" fr JOIN "phase5_pair_rank" r ON r."id" = fr."id" AND r.rn > 1;

DELETE FROM "family_relationships" fr USING "phase5_pair_rank" r WHERE r."id" = fr."id" AND r.rn > 1;

DROP TABLE "phase5_pair_rank";

-- 1c. Rows stored the other way round: swap them and invert the type.
INSERT INTO "phase5_archive"."family_relationships" ("sourceSchema", "id", "row", "migration", "reason")
SELECT current_schema(), fr."id", to_jsonb(fr), '20261012030000_family_integrity',
       'swapped into canonical order (type inverted; the row shows it before the swap)'
FROM "family_relationships" fr
WHERE fr."primaryUserId" > fr."relatedUserId" COLLATE "C";

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
WHERE "primaryUserId" > "relatedUserId" COLLATE "C";

-- 1d. The constraint.
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_pair_order_check"
  CHECK ("primaryUserId" < "relatedUserId" COLLATE "C");

-- 2a. A head with no family joins the (oldest) family they head.
CREATE TEMP TABLE "phase5_head_joins" AS
  SELECT DISTINCT ON (f."headOfFamilyId") f."headOfFamilyId" AS user_id, f."id" AS family_id
  FROM "families" f JOIN "users" u ON u."id" = f."headOfFamilyId"
  WHERE u."familyId" IS NULL
  ORDER BY f."headOfFamilyId", f."createdAt", f."id";

INSERT INTO "phase5_archive"."value_changes"
  ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
SELECT current_schema(), 'users', j.user_id, 'familyId', NULL, j.family_id,
       '20261012030000_family_integrity', 'head of family with no family joined the family they head'
FROM "phase5_head_joins" j;

UPDATE "users" u SET "familyId" = j.family_id FROM "phase5_head_joins" j WHERE u."id" = j.user_id;

DROP TABLE "phase5_head_joins";

-- 2b. A head who belongs to another family is cleared.
INSERT INTO "phase5_archive"."value_changes"
  ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
SELECT current_schema(), 'families', f."id", 'headOfFamilyId', f."headOfFamilyId", NULL,
       '20261012030000_family_integrity', 'set to NULL (the head belongs to another family)'
FROM "families" f JOIN "users" u ON u."id" = f."headOfFamilyId"
WHERE u."familyId" IS DISTINCT FROM f."id";

UPDATE "families" f SET "headOfFamilyId" = NULL
FROM "users" u
WHERE u."id" = f."headOfFamilyId" AND u."familyId" IS DISTINCT FROM f."id";
