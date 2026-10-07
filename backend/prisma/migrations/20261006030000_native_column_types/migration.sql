-- P3-D4 Native column types (PHASE3_SPECS.md 1.3). Columns that held JSON encoded as text become
-- native Postgres types; the stored strings are parsed, never discarded silently:
--
--   users.volunteerSkills, users.interests, media.tags, roles.permissions  TEXT -> TEXT[]
--     A JSON array keeps its elements in order: strings are trimmed, numbers and booleans become
--     their text, and null, blank, object and nested array elements are dropped. NULL, blank,
--     unparsable or non-array values become the empty array '{}'. Every non-blank value that is
--     not a JSON array whose elements all survive in order (for example the plain text
--     'Music, Teaching', or an array holding a null) is recorded first in
--     phase3_archive.value_changes (original text, new array text), with the reason
--     'list text not fully convertible ...'.
--     media.tags are then put in the tag form the API stores (PHASE3_SPECS.md 7.1, the shared
--     normalizeMediaTag): trimmed, lower-cased, each run of whitespace or hyphens one '-', and
--     duplicates dropped (the first one kept). Every tag list this changes is recorded too
--     ('media tags normalised to the tag form').
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

-- A non-blank list value whose converted array does not carry all of it (see the header).
CREATE FUNCTION phase3_list_lossy(raw TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parsed JSONB := phase3_try_jsonb(raw);
BEGIN
  IF raw IS NULL OR raw ~ '^[[:space:]]*$' THEN
    RETURN FALSE;
  END IF;
  RETURN parsed IS NULL OR jsonb_typeof(parsed) <> 'array'
    OR cardinality(phase3_text_array(raw)) <> jsonb_array_length(parsed);
END;
$$;

-- The media tag list in the stored tag form (the shared normalizeMediaTag), first one of each kept.
CREATE FUNCTION phase3_media_tags(raw TEXT) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(n.tag ORDER BY n.first_at), '{}')
  FROM (
    SELECT t.tag, min(t.ordinality) AS first_at
    FROM (
      SELECT regexp_replace(lower(regexp_replace(e.value, '^[[:space:]]+|[[:space:]]+$', '', 'g')),
                            '[[:space:]-]+', '-', 'g') AS tag, e.ordinality
      FROM unnest(phase3_text_array(raw)) WITH ORDINALITY AS e(value, ordinality)
    ) AS t
    WHERE t.tag <> ''
    GROUP BY t.tag
  ) AS n
$$;

-- Records the rows of tbl whose list column col does not convert fully (see the header).
CREATE FUNCTION phase3_record_lossy_list(tbl TEXT, col TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO "phase3_archive"."value_changes"
       ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
     SELECT current_schema(), %L, "id", %L, %I, phase3_text_array(%I)::text, %L, %L
     FROM %I WHERE phase3_list_lossy(%I)',
    tbl, col, col, col, '20261006030000_native_column_types',
    'list text not fully convertible (not a JSON array of non-blank strings, numbers or booleans)',
    tbl, col);
END;
$$;

-- 1. String lists
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

SELECT phase3_record_lossy_list('users', 'volunteerSkills');
SELECT phase3_record_lossy_list('users', 'interests');
SELECT phase3_record_lossy_list('roles', 'permissions');
INSERT INTO "phase3_archive"."value_changes"
    ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
  SELECT current_schema(), 'media', "id", 'tags', "tags", phase3_media_tags("tags")::text,
         '20261006030000_native_column_types',
         CASE WHEN phase3_list_lossy("tags")
              THEN 'list text not fully convertible (not a JSON array of non-blank strings, numbers or booleans)'
                   || CASE WHEN phase3_media_tags("tags") <> phase3_text_array("tags")
                           THEN '; media tags normalised to the tag form' ELSE '' END
              ELSE 'media tags normalised to the tag form' END
  FROM "media"
  WHERE phase3_list_lossy("tags") OR phase3_media_tags("tags") <> phase3_text_array("tags");

DO $$
DECLARE
  ids TEXT;
BEGIN
  SELECT string_agg("tableName" || '.' || "columnName" || ':' || "rowId", ', '
                    ORDER BY "tableName", "columnName", "rowId") INTO ids
    FROM "phase3_archive"."value_changes"
    WHERE "sourceSchema" = current_schema() AND "migration" = '20261006030000_native_column_types';
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'list values changed by the conversion (recorded in phase3_archive.value_changes): %', ids;
  END IF;
END;
$$;

ALTER TABLE "users"
  ALTER COLUMN "volunteerSkills" TYPE TEXT[] USING phase3_text_array("volunteerSkills"),
  ALTER COLUMN "volunteerSkills" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "interests" TYPE TEXT[] USING phase3_text_array("interests"),
  ALTER COLUMN "interests" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "media"
  ALTER COLUMN "tags" TYPE TEXT[] USING phase3_media_tags("tags"),
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

DROP FUNCTION phase3_record_lossy_list(TEXT, TEXT);
DROP FUNCTION phase3_media_tags(TEXT);
DROP FUNCTION phase3_list_lossy(TEXT);
DROP FUNCTION phase3_text_array(TEXT);
DROP FUNCTION phase3_metadata(TEXT);
DROP FUNCTION phase3_too_deep(JSONB);
DROP FUNCTION phase3_try_jsonb(TEXT);
