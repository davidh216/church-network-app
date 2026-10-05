-- P3-D4 Native column types (PHASE3_SPECS.md 1.3). Columns that held JSON encoded as text become
-- native Postgres types; the stored strings are parsed, never discarded silently:
--
--   users.volunteerSkills, users.interests, media.tags, roles.permissions  TEXT -> TEXT[]
--     A JSON array keeps its elements in order: strings are trimmed, numbers and booleans become
--     their text, and null, blank, object and nested array elements are dropped. NULL, blank,
--     unparsable or non-array values become the empty array '{}'.
--   member_activities.metadata, member_interactions.metadata  TEXT -> JSONB (nullable)
--     A parsable JSON value is kept as is. NULL, blank and a JSON null become NULL. Non-blank text
--     that does not parse (including JSON with a \u0000 escape, which jsonb rejects), or that
--     parses to a value nested 64 levels deep or deeper (Prisma cannot read values that deep),
--     becomes a JSON string holding the original text, so nothing is lost and the row stays
--     readable.
--   saved_searches.query  TEXT -> JSONB (required)
--     Parsable values are kept (one that parses but no longer matches the search schema is
--     returned by the API with invalid: true, as before). Rows whose query does not parse as JSON,
--     or parses to a value nested 64 levels deep or deeper, cannot be applied or repaired and are
--     DELETED: each one is first copied whole (as JSON, query as text) into
--     phase3_archive.saved_searches and its id, owner and name is listed by RAISE NOTICE.
--
-- Audit trail: the schema phase3_archive is outside Prisma's "public" schema (no drift) and can be
-- dropped (DROP SCHEMA "phase3_archive" CASCADE) once the operator has checked it.
--
-- The array columns keep a default of '{}' so new rows start empty.

CREATE FUNCTION phase3_try_jsonb(raw TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- True when value holds an element 64 levels below its root.
CREATE FUNCTION phase3_too_deep(value JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_path_exists(value, 'strict $.**{64}') $$;

-- Metadata: parsed JSON, else the original text as a JSON string (see the header).
CREATE FUNCTION phase3_metadata(raw TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parsed JSONB := phase3_try_jsonb(raw);
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  IF parsed IS NULL OR phase3_too_deep(parsed) THEN
    RETURN to_jsonb(raw);
  END IF;
  RETURN NULLIF(parsed, 'null'::jsonb);
END;
$$;

CREATE FUNCTION phase3_text_array(raw TEXT) RETURNS TEXT[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parsed JSONB := phase3_try_jsonb(raw);
BEGIN
  IF parsed IS NULL OR jsonb_typeof(parsed) <> 'array' THEN
    RETURN '{}';
  END IF;
  RETURN COALESCE(
    (SELECT array_agg(btrim(e.value #>> '{}') ORDER BY e.ordinality)
       FROM jsonb_array_elements(parsed) WITH ORDINALITY AS e(value, ordinality)
      WHERE jsonb_typeof(e.value) IN ('string', 'number', 'boolean')
        AND btrim(e.value #>> '{}') <> ''),
    '{}');
END;
$$;

-- 1. String lists
ALTER TABLE "users"
  ALTER COLUMN "volunteerSkills" TYPE TEXT[] USING phase3_text_array("volunteerSkills"),
  ALTER COLUMN "volunteerSkills" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "interests" TYPE TEXT[] USING phase3_text_array("interests"),
  ALTER COLUMN "interests" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "media"
  ALTER COLUMN "tags" TYPE TEXT[] USING phase3_text_array("tags"),
  ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "tags" DROP NOT NULL;

ALTER TABLE "roles"
  ALTER COLUMN "permissions" TYPE TEXT[] USING phase3_text_array("permissions"),
  ALTER COLUMN "permissions" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "permissions" DROP NOT NULL;

-- 2. Metadata objects
ALTER TABLE "member_activities"
  ALTER COLUMN "metadata" TYPE JSONB USING phase3_metadata("metadata");

ALTER TABLE "member_interactions"
  ALTER COLUMN "metadata" TYPE JSONB USING phase3_metadata("metadata");

-- 3. Saved search queries: archive, list, then delete the rows that do not parse or are too deep
CREATE SCHEMA IF NOT EXISTS "phase3_archive";
CREATE TABLE IF NOT EXISTS "phase3_archive"."saved_searches" (
  "sourceSchema" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "row" JSONB NOT NULL,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TEMP TABLE "phase3_bad_searches" AS
  SELECT "id", CASE WHEN phase3_try_jsonb("query") IS NULL THEN 'query is not JSON'
                    ELSE 'query nested 64 levels or deeper' END AS reason
  FROM "saved_searches"
  WHERE phase3_try_jsonb("query") IS NULL OR phase3_too_deep(phase3_try_jsonb("query"));

INSERT INTO "phase3_archive"."saved_searches" ("sourceSchema", "id", "row", "migration", "reason")
  SELECT current_schema(), s."id", to_jsonb(s), '20261006030000_native_column_types', b.reason
  FROM "saved_searches" s JOIN "phase3_bad_searches" b ON b."id" = s."id";

DO $$
DECLARE
  bad RECORD;
BEGIN
  FOR bad IN
    SELECT s."id", s."createdById", s."name", b.reason FROM "saved_searches" s
      JOIN "phase3_bad_searches" b ON b."id" = s."id" ORDER BY s."id"
  LOOP
    RAISE NOTICE 'saved_searches row deleted (%, copied to phase3_archive.saved_searches): id=%, createdById=%, name=%',
      bad.reason, bad."id", bad."createdById", bad."name";
  END LOOP;
END;
$$;

DELETE FROM "saved_searches" s USING "phase3_bad_searches" b WHERE b."id" = s."id";
DROP TABLE "phase3_bad_searches";

ALTER TABLE "saved_searches"
  ALTER COLUMN "query" TYPE JSONB USING phase3_try_jsonb("query");

DROP FUNCTION phase3_text_array(TEXT);
DROP FUNCTION phase3_metadata(TEXT);
DROP FUNCTION phase3_too_deep(JSONB);
DROP FUNCTION phase3_try_jsonb(TEXT);
