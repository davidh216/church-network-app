-- Data migration (the schema is unchanged): give every user that lacks one a member_engagement
-- row with the column defaults (score 0, stage visitor, risk low), so the engagement filters and
-- sorts see every account. Accounts created from now on get their row when they are created
-- (registration, staff create, seeded admin). Safe to run again: it only fills gaps.
INSERT INTO "member_engagement" ("id", "userId", "updatedAt")
SELECT gen_random_uuid()::text, u."id", CURRENT_TIMESTAMP
FROM "users" AS u
WHERE NOT EXISTS (
    SELECT 1 FROM "member_engagement" AS e WHERE e."userId" = u."id"
);
