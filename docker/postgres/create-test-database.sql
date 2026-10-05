-- Runs once, when the db volume is first initialised. church_dev is created by POSTGRES_DB;
-- the backend test suite (backend/vitest.config.mts) uses church_test.
CREATE DATABASE church_test;
