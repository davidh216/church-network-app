-- G4 review fix (I-F6): relationships whose people are not both in the relationship's family.
--
-- Before family writes locked the family row, a relationship could be saved while one of its
-- people was being removed from (or moved out of) the family, leaving a row that joins someone
-- outside it. The profile and /api/families/mine already hide such rows; this removes them, so
-- the rule "a relationship joins two members of its family" holds for the stored data too.
-- Every row where the primary or the related user's "familyId" differs from the row's
-- "familyId" (including a user with no family), active or not, is copied whole (as JSON) into
-- phase5_archive.family_relationships with the reason, then deleted.
--
-- Destructive step: the deleted family_relationships rows (archived as above). The schema
-- phase5_archive is outside Prisma's "public" schema; the operator may drop it once checked.
-- Rows are tagged with the schema the migration ran in.

CREATE SCHEMA IF NOT EXISTS "phase5_archive";
CREATE TABLE IF NOT EXISTS "phase5_archive"."family_relationships" (
  "sourceSchema" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "row" JSONB NOT NULL,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TEMP TABLE "phase5_outside_family" AS
  SELECT fr."id",
    CASE
      WHEN pu."familyId" IS DISTINCT FROM fr."familyId" AND ru."familyId" IS DISTINCT FROM fr."familyId"
        THEN 'deleted (neither user is in the relationship''s family)'
      WHEN pu."familyId" IS DISTINCT FROM fr."familyId"
        THEN 'deleted (the primary user is not in the relationship''s family)'
      ELSE 'deleted (the related user is not in the relationship''s family)'
    END AS reason
  FROM "family_relationships" fr
  JOIN "users" pu ON pu."id" = fr."primaryUserId"
  JOIN "users" ru ON ru."id" = fr."relatedUserId"
  WHERE pu."familyId" IS DISTINCT FROM fr."familyId" OR ru."familyId" IS DISTINCT FROM fr."familyId";

INSERT INTO "phase5_archive"."family_relationships" ("sourceSchema", "id", "row", "migration", "reason")
SELECT current_schema(), fr."id", to_jsonb(fr), '20261012040000_family_relationship_cleanup', o.reason
FROM "family_relationships" fr JOIN "phase5_outside_family" o ON o."id" = fr."id";

DELETE FROM "family_relationships" fr USING "phase5_outside_family" o WHERE o."id" = fr."id";

DROP TABLE "phase5_outside_family";
