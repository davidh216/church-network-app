-- G2 (PHASE5_SPECS.md 2): tags record when they were last changed. Existing tags start with
-- their creation time; the default only fills the column and is dropped again, as Prisma sets
-- @updatedAt itself.
ALTER TABLE "member_tags" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "member_tags" SET "updatedAt" = "createdAt";
ALTER TABLE "member_tags" ALTER COLUMN "updatedAt" DROP DEFAULT;
