-- P3-D5: services and attendance (PHASE3_SPECS.md 1.4).
--
-- A "services" table holds each held service once per (date, type). Attendance rows stop
-- carrying their own serviceDate/serviceType and point at a service instead.
--
-- Data rules:
--   One service is created per distinct legacy (attendance.serviceDate::date, serviceType). Its id
--   is derived from that pair ('c' + 24 hex digits of md5, a valid cuid shape), its createdAt is
--   the earliest createdAt of the attendance rows it groups, and title, notes and createdById are
--   NULL. Each attendance row is repointed to its service.
--   The legacy unique key (userId, serviceDate, serviceType) compared timestamps, so a member could
--   hold two rows on the same day for the same type (two times of day). Those rows now name the
--   same service and would break the new unique key (userId, serviceId); they are collapsed into
--   one: the oldest row (by createdAt, then id) is kept, it is present if any collapsed row was,
--   and its notes become the distinct non-blank notes of the collapsed rows, oldest first, joined
--   by a newline. Every deleted duplicate is first copied whole (as JSON) into
--   phase3_archive.attendance and its id is listed by RAISE NOTICE, and where the merge changes
--   the kept row's present or notes, its original value is recorded in
--   phase3_archive.value_changes ('kept row before merge ...'). No other row is deleted.
--   recordedById starts NULL for every legacy row.
--
-- Audit trail: the schema phase3_archive is outside Prisma's "public" schema (no drift) and can be
-- dropped (DROP SCHEMA "phase3_archive" CASCADE) once the operator has checked it.

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ServiceType" NOT NULL DEFAULT 'sunday_service',
    "title" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- One service per distinct legacy (date, type)
INSERT INTO "services" ("id", "date", "type", "createdAt")
SELECT 'c' || substr(md5('service:' || legacy.d::text || ':' || legacy.t::text), 1, 24),
       legacy.d, legacy.t, legacy.first_created
FROM (
    SELECT "serviceDate"::date AS d, "serviceType" AS t, min("createdAt") AS first_created
    FROM "attendance"
    GROUP BY 1, 2
) AS legacy;

-- Repoint attendance rows
ALTER TABLE "attendance" ADD COLUMN "serviceId" TEXT,
ADD COLUMN "recordedById" TEXT;

UPDATE "attendance" AS a SET "serviceId" = s."id"
FROM "services" AS s
WHERE s."date" = a."serviceDate"::date AND s."type" = a."serviceType";

-- Collapse rows that now name the same (userId, serviceId)
CREATE SCHEMA IF NOT EXISTS "phase3_archive";
CREATE TABLE IF NOT EXISTS "phase3_archive"."attendance" (
  "sourceSchema" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "row" JSONB NOT NULL,
  "migration" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
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

DO $$
DECLARE
  ids TEXT;
BEGIN
  CREATE TEMP TABLE "phase3_attendance_ranked" ON COMMIT DROP AS
  SELECT "id", "userId", "serviceId",
         row_number() OVER w AS rn,
         first_value("id") OVER w AS kept_id,
         bool_or("present") OVER g AS any_present
  FROM "attendance"
  WINDOW g AS (PARTITION BY "userId", "serviceId"),
         w AS (PARTITION BY "userId", "serviceId" ORDER BY "createdAt", "id");

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "phase3_attendance_ranked" WHERE rn > 1;
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'attendance rows collapsed into an earlier row for the same member and service (deleted, copied to phase3_archive.attendance): %', ids;

    INSERT INTO "phase3_archive"."attendance" ("sourceSchema", "id", "row", "migration", "reason")
      SELECT current_schema(), a."id", to_jsonb(a), '20261006040000_services_and_attendance',
             'collapsed into attendance row ' || r.kept_id || ' (same member and service day)'
      FROM "attendance" AS a JOIN "phase3_attendance_ranked" AS r ON r."id" = a."id" AND r.rn > 1;

    -- The kept rows of a collapse as they were, to record what the merge below changes.
    CREATE TEMP TABLE "phase3_attendance_kept" ON COMMIT DROP AS
    SELECT a."id", a."present", a."notes"
    FROM "attendance" AS a JOIN "phase3_attendance_ranked" AS r ON r."id" = a."id" AND r.rn = 1
    WHERE EXISTS (
      SELECT 1 FROM "phase3_attendance_ranked" AS dup
      WHERE dup."userId" = r."userId" AND dup."serviceId" = r."serviceId" AND dup.rn > 1
    );

    UPDATE "attendance" AS a
    SET "present" = r.any_present,
        "notes" = (
          SELECT string_agg(n.note, E'\n' ORDER BY n.first_at, n.note)
          FROM (
            SELECT trim(d."notes") AS note, min(d."createdAt") AS first_at
            FROM "attendance" AS d
            WHERE d."userId" = a."userId" AND d."serviceId" = a."serviceId"
              AND d."notes" IS NOT NULL AND trim(d."notes") <> ''
            GROUP BY trim(d."notes")
          ) AS n
        )
    FROM "phase3_attendance_ranked" AS r
    WHERE a."id" = r."id" AND r.rn = 1
      AND EXISTS (
        SELECT 1 FROM "phase3_attendance_ranked" AS dup
        WHERE dup."userId" = r."userId" AND dup."serviceId" = r."serviceId" AND dup.rn > 1
      );

    INSERT INTO "phase3_archive"."value_changes"
        ("sourceSchema", "tableName", "rowId", "columnName", "oldValue", "newValue", "migration", "reason")
      SELECT current_schema(), 'attendance', k."id", c.col, c.old_value, c.new_value,
             '20261006040000_services_and_attendance',
             'kept row before merge (collapsed rows of the same member and service day)'
      FROM "phase3_attendance_kept" AS k JOIN "attendance" AS a ON a."id" = k."id"
      CROSS JOIN LATERAL (VALUES
        ('present', k."present"::text, a."present"::text),
        ('notes', k."notes", a."notes")) AS c(col, old_value, new_value)
      WHERE c.old_value IS DISTINCT FROM c.new_value;

    DELETE FROM "attendance" AS a USING "phase3_attendance_ranked" AS r
    WHERE a."id" = r."id" AND r.rn > 1;
    DROP TABLE "phase3_attendance_kept";
  END IF;
END $$;

ALTER TABLE "attendance" ALTER COLUMN "serviceId" SET NOT NULL;

-- DropIndex
DROP INDEX "attendance_userId_serviceDate_serviceType_key";

-- AlterTable
ALTER TABLE "attendance" DROP COLUMN "serviceDate",
DROP COLUMN "serviceType";

-- CreateIndex
CREATE INDEX "services_date_idx" ON "services"("date");

-- CreateIndex
CREATE INDEX "services_createdById_idx" ON "services"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "services_date_type_key" ON "services"("date", "type");

-- CreateIndex
CREATE INDEX "attendance_serviceId_idx" ON "attendance"("serviceId");

-- CreateIndex
CREATE INDEX "attendance_recordedById_idx" ON "attendance"("recordedById");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_userId_serviceId_key" ON "attendance"("userId", "serviceId");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
