-- P3-D4 Native column types (PHASE3_SPECS.md 1.3). Columns that held JSON encoded as text become
-- native Postgres types; the stored strings are parsed, never discarded silently:
--
--   users.volunteerSkills, users.interests, media.tags, roles.permissions  TEXT -> TEXT[]
--     A JSON array keeps its elements in order: strings are trimmed, numbers and booleans become
--     their text, and null, blank, object and nested array elements are dropped. NULL, blank,
--     unparsable or non-array values become the empty array '{}'.
--   member_activities.metadata, member_interactions.metadata  TEXT -> JSONB (nullable)
--     Any parsable JSON value is kept as is. NULL, blank, unparsable values and a JSON null
--     become NULL.
--   saved_searches.query  TEXT -> JSONB (required)
--     Parsable values are kept (one that parses but no longer matches the search schema is
--     returned by the API with invalid: true, as before). Rows whose query does not parse as JSON
--     cannot be applied or repaired and are DELETED; each one's id, owner and name is listed by
--     RAISE NOTICE when the migration runs (the rows a database holds are not known when this
--     file is written).
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
  ALTER COLUMN "metadata" TYPE JSONB USING NULLIF(phase3_try_jsonb("metadata"), 'null'::jsonb);

ALTER TABLE "member_interactions"
  ALTER COLUMN "metadata" TYPE JSONB USING NULLIF(phase3_try_jsonb("metadata"), 'null'::jsonb);

-- 3. Saved search queries: list, then delete, the rows that do not parse
DO $$
DECLARE
  bad RECORD;
BEGIN
  FOR bad IN
    SELECT "id", "createdById", "name" FROM "saved_searches"
     WHERE phase3_try_jsonb("query") IS NULL ORDER BY "id"
  LOOP
    RAISE NOTICE 'saved_searches row deleted (query is not JSON): id=%, createdById=%, name=%',
      bad."id", bad."createdById", bad."name";
  END LOOP;
END;
$$;

DELETE FROM "saved_searches" WHERE phase3_try_jsonb("query") IS NULL;

ALTER TABLE "saved_searches"
  ALTER COLUMN "query" TYPE JSONB USING phase3_try_jsonb("query");

DROP FUNCTION phase3_text_array(TEXT);
DROP FUNCTION phase3_try_jsonb(TEXT);
