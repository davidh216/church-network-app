-- Phase 0 lowercases emails on register, login and user creation; bring existing rows in line.
UPDATE "users" SET "email" = lower("email");
