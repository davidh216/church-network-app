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
--   by a newline. Every deleted duplicate id is listed by RAISE NOTICE when the migration runs.
--   No other row is deleted. recordedById starts NULL for every legacy row.

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
DO $$
DECLARE
  ids TEXT;
BEGIN
  CREATE TEMP TABLE "phase3_attendance_ranked" ON COMMIT DROP AS
  SELECT "id", "userId", "serviceId",
         row_number() OVER w AS rn,
         bool_or("present") OVER g AS any_present
  FROM "attendance"
  WINDOW g AS (PARTITION BY "userId", "serviceId"),
         w AS (PARTITION BY "userId", "serviceId" ORDER BY "createdAt", "id");

  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids FROM "phase3_attendance_ranked" WHERE rn > 1;
  IF ids IS NOT NULL THEN
    RAISE NOTICE 'attendance rows collapsed into an earlier row for the same member and service (deleted): %', ids;

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

    DELETE FROM "attendance" AS a USING "phase3_attendance_ranked" AS r
    WHERE a."id" = r."id" AND r.rn > 1;
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
