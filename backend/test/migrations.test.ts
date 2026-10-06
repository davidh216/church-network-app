import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';

// Data-transforming migrations run against a fixture holding legacy values (PHASE3_SPECS.md 0.1).
// Each fixture lives in its own Postgres schema of the test database: the migrations before the
// one under test are applied there, the legacy rows are inserted, then the migration under test
// runs, all in one `prisma db execute` session with `search_path` pointing at the fixture schema.
const BACKEND = resolve(__dirname, '..');
const MIGRATIONS = resolve(BACKEND, 'prisma', 'migrations');
// The fixtures are built in the database the Prisma client reads (DATABASE_URL from the vitest
// config), without its ?schema= parameter: every script sets its own search_path.
const TEST_DATABASE_URL = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
const testDatabaseName = TEST_DATABASE_URL ? new URL(TEST_DATABASE_URL).pathname.slice(1) : '';
if (!testDatabaseName || testDatabaseName === 'church_dev') {
  throw new Error(
    `migrations.test needs DATABASE_URL to name a test database, not "${testDatabaseName}"`,
  );
}

const migrationNames = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const migrationSql = (name: string) =>
  readFileSync(resolve(MIGRATIONS, name, 'migration.sql'), 'utf8');

function execute(sql: string) {
  execSync(`npx prisma db execute --stdin --url "${TEST_DATABASE_URL}"`, {
    cwd: BACKEND,
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// The Phase 3 migrations record what they delete, repoint or remap in the shared schema
// "phase3_archive", tagged with the schema they ran in. Each fixture clears its own rows there
// before it is built and when it is dropped; other rows in the archive are left alone.
const clearArchive = (schema: string) => `
  DO $$
  DECLARE t TEXT;
  BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'phase3_archive' LOOP
      EXECUTE format('DELETE FROM "phase3_archive".%I WHERE "sourceSchema" = %L', t, '${schema}');
    END LOOP;
  END $$;`;

/**
 * Builds `schema` up to (not including) `migration`, loads `fixture`, then applies `migration`
 * (and, with `toHead`, every later migration too).
 */
function migrateFixture(schema: string, migration: string, fixture: string, toHead = false) {
  const index = migrationNames.indexOf(migration);
  if (index < 0) throw new Error(`unknown migration ${migration}`);
  const before = migrationNames.slice(0, index).map(migrationSql);
  const after = toHead ? migrationNames.slice(index + 1).map(migrationSql) : [];
  execute(
    [
      clearArchive(schema),
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
      `CREATE SCHEMA "${schema}";`,
      `SET search_path TO "${schema}";`,
      ...before,
      fixture,
      migrationSql(migration),
      ...after,
    ].join('\n'),
  );
}

const dropSchema = (schema: string) =>
  execute(`${clearArchive(schema)}\nDROP SCHEMA IF EXISTS "${schema}" CASCADE;`);

type ArchivedRow = { id: string; row: Record<string, unknown>; migration: string; reason: string };
type ValueChange = {
  tableName: string;
  rowId: string;
  columnName: string;
  oldValue: string | null;
  newValue: string | null;
};

/** The rows `schema`'s migrations copied into phase3_archive.<table> before deleting them. */
const archivedRows = (schema: string, table: string) =>
  prisma.$queryRawUnsafe<ArchivedRow[]>(
    `SELECT "id", "row", "migration", "reason" FROM "phase3_archive"."${table}"
     WHERE "sourceSchema" = $1 ORDER BY "id"`,
    schema,
  );

/** The references and enum values `schema`'s migrations changed, as "table.column:id old -> new". */
const valueChanges = async (schema: string) =>
  (
    await prisma.$queryRawUnsafe<ValueChange[]>(
      `SELECT "tableName", "rowId", "columnName", "oldValue", "newValue"
       FROM "phase3_archive"."value_changes" WHERE "sourceSchema" = $1
       ORDER BY "tableName", "columnName", "rowId"`,
      schema,
    )
  ).map((c) => `${c.tableName}.${c.columnName}:${c.rowId} ${c.oldValue} -> ${c.newValue}`);

describe('20261006010000_enum_columns (D2)', () => {
  const schema = 'fixture_d2_enums';
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));

  beforeAll(() => {
    migrateFixture(
      schema,
      '20261006010000_enum_columns',
      `
      INSERT INTO "users" ("id", "email", "password", "name", "updatedAt", "gender", "maritalStatus", "membershipType") VALUES
        ('u1', 'u1@example.org', 'x', 'U1', now(), 'Female', 'married', 'Regular Attendee'),
        ('u2', 'u2@example.org', 'x', 'U2', now(), 'M', 'complicated', 'guest'),
        ('u3', 'u3@example.org', 'x', 'U3', now(), '  ', NULL, NULL);
      INSERT INTO "member_engagement" ("id", "userId", "updatedAt", "membershipStage", "riskLevel") VALUES
        ('e1', 'u1', now(), 'Core Member', 'HIGH'),
        ('e2', 'u2', now(), 'champion', 'severe'),
        ('e3', 'u3', now(), 'new-member', 'low');
      INSERT INTO "media" ("id", "title", "type", "url", "tags", "uploadedById", "updatedAt") VALUES
        ('m1', 'Old', 'VIDEO', 'https://example.org/v', '[]', 'u1', now()),
        ('m2', 'New', 'YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '[]', 'u1', now());
      INSERT INTO "groups" ("id", "name", "type", "updatedAt") VALUES
        ('g1', 'Choir', 'Small Group', now()),
        ('g2', 'Other', 'book club', now());
      INSERT INTO "group_members" ("id", "userId", "groupId", "role") VALUES
        ('gm1', 'u1', 'g1', 'co-leader'),
        ('gm2', 'u2', 'g1', 'Leader'),
        ('gm3', 'u3', 'g1', 'captain');
      INSERT INTO "attendance" ("id", "userId", "serviceDate", "serviceType", "present", "createdAt") VALUES
        ('a3', 'u1', '2026-01-07', 'youth night', true, '2026-01-07 19:00'),
        ('a4', 'u2', '2026-01-04', 'bible-study', false, '2026-01-04 09:00');
      -- a1/a2 and a5/a6 collide once normalised (a5 and a6 both become 'other'); all carry notes.
      INSERT INTO "attendance" ("id", "userId", "serviceDate", "serviceType", "present", "notes", "createdAt") VALUES
        ('a1', 'u1', '2026-01-04', 'Sunday Service', true, 'arrived late', '2026-01-04 10:00'),
        ('a2', 'u1', '2026-01-04', 'sunday_service', false, 'brought a guest', '2026-01-04 11:00'),
        ('a5', 'u2', '2026-01-07 19:00', 'Youth Night', false, 'youth A', '2026-01-07 19:00'),
        ('a6', 'u2', '2026-01-07 19:00', 'choir', true, ' choir B ', '2026-01-07 19:30');
      INSERT INTO "families" ("id", "familyName", "updatedAt") VALUES ('f1', 'Doe', now());
      INSERT INTO "family_relationships" ("id", "primaryUserId", "relatedUserId", "relationshipType", "isActive", "familyId", "createdAt", "updatedAt") VALUES
        ('r1', 'u1', 'u2', 'Spouse', true, 'f1', '2026-01-01', now()),
        ('r2', 'u1', 'u2', 'spouse', false, 'f1', '2026-01-02', now()),
        ('r3', 'u1', 'u3', 'cousin', true, 'f1', '2026-01-01', now());
      INSERT INTO "member_activities" ("id", "userId", "activityType") VALUES
        ('act1', 'u1', 'group_participation'),
        ('act2', 'u1', 'Volunteer');
      INSERT INTO "member_interactions" ("id", "userId", "interactionType", "channel", "status", "category", "priority") VALUES
        ('i1', 'u1', 'letter', 'Fax', 'pending', 'random', 'whatever'),
        ('i2', 'u1', 'Call Made', 'In Person', 'completed', 'follow-up', 'urgent');
      INSERT INTO "member_milestones" ("id", "userId", "milestoneType", "title", "achievedDate", "category", "impact") VALUES
        ('ms1', 'u1', 'graduation', 'Graduated', '2026-01-01', 'academic', 'huge'),
        ('ms2', 'u1', 'Baptism', 'Baptised', '2026-01-01', 'Spiritual', 'HIGH');
      INSERT INTO "member_notes" ("id", "userId", "authorId", "content", "noteType", "updatedAt") VALUES
        ('n1', 'u1', 'u2', 'x', 'random', now()),
        ('n2', 'u1', 'u2', 'y', 'Prayer Request', now());
      INSERT INTO "member_tags" ("id", "name", "category") VALUES
        ('t1', 'Mystery', 'mystery'),
        ('t2', 'Youth', 'Demographic');
      `,
    );
  }, 60_000);

  afterAll(() => dropSchema(schema));

  const column = async (table: string, col: string) =>
    Object.fromEntries(
      (
        await rows<{ id: string; v: string | null }>(
          `SELECT "id", "${col}"::text AS v FROM "$s"."${table}" ORDER BY "id"`,
        )
      ).map(({ id, v }) => [id, v]),
    );

  it('turns every listed column into its Postgres enum type', async () => {
    const types = await rows<{ table_name: string; column_name: string; udt_name: string }>(
      `SELECT table_name, column_name, udt_name FROM information_schema.columns
       WHERE table_schema = '$s' AND data_type = 'USER-DEFINED' ORDER BY table_name, column_name`,
    );
    expect(types.map((t) => `${t.table_name}.${t.column_name}:${t.udt_name}`)).toEqual([
      'attendance.serviceType:ServiceType',
      'family_relationships.relationshipType:RelationshipType',
      'group_members.role:GroupMemberRole',
      'groups.type:GroupType',
      'media.type:MediaType',
      'member_activities.activityType:ActivityType',
      'member_engagement.membershipStage:MembershipStage',
      'member_engagement.riskLevel:RiskLevel',
      'member_interactions.category:InteractionCategory',
      'member_interactions.channel:Channel',
      'member_interactions.interactionType:InteractionType',
      'member_interactions.priority:Priority',
      'member_interactions.status:InteractionStatus',
      'member_milestones.category:MilestoneCategory',
      'member_milestones.impact:Impact',
      'member_milestones.milestoneType:MilestoneType',
      'member_notes.noteType:NoteType',
      'member_tags.category:TagCategory',
      'users.gender:Gender',
      'users.maritalStatus:MaritalStatus',
      'users.membershipType:MembershipType',
    ]);
  });

  it('rewrites co-leader and normalises case, spaces and hyphens', async () => {
    expect(await column('group_members', 'role')).toEqual({
      gm1: 'co_leader',
      gm2: 'leader',
      gm3: 'member',
    });
    expect(await column('groups', 'type')).toEqual({ g1: 'small_group', g2: 'ministry' });
    expect(await column('member_engagement', 'membershipStage')).toEqual({
      e1: 'core_member',
      e2: 'visitor',
      e3: 'new_member',
    });
    expect(await column('member_engagement', 'riskLevel')).toEqual({
      e1: 'high',
      e2: 'low',
      e3: 'low',
    });
  });

  it('maps unknown values to the safest member, or NULL for optional profile fields', async () => {
    expect(await column('users', 'gender')).toEqual({ u1: 'female', u2: 'other', u3: null });
    expect(await column('users', 'maritalStatus')).toEqual({ u1: 'married', u2: null, u3: null });
    expect(await column('users', 'membershipType')).toEqual({
      u1: 'regular_attendee',
      u2: null,
      u3: null,
    });
    expect(await column('media', 'type')).toEqual({ m1: 'YOUTUBE_VIDEO', m2: 'YOUTUBE_VIDEO' });
    expect(await column('member_activities', 'activityType')).toEqual({
      act1: 'other',
      act2: 'volunteer',
    });
    expect(await column('member_interactions', 'interactionType')).toEqual({
      i1: 'note_added',
      i2: 'call_made',
    });
    expect(await column('member_interactions', 'channel')).toEqual({
      i1: 'in_person',
      i2: 'in_person',
    });
    expect(await column('member_interactions', 'status')).toEqual({
      i1: 'completed',
      i2: 'completed',
    });
    expect(await column('member_interactions', 'category')).toEqual({ i1: null, i2: 'follow_up' });
    expect(await column('member_interactions', 'priority')).toEqual({ i1: 'normal', i2: 'urgent' });
    expect(await column('member_milestones', 'milestoneType')).toEqual({
      ms1: 'other',
      ms2: 'baptism',
    });
    expect(await column('member_milestones', 'category')).toEqual({
      ms1: 'general',
      ms2: 'spiritual',
    });
    expect(await column('member_milestones', 'impact')).toEqual({ ms1: 'medium', ms2: 'high' });
    expect(await column('member_notes', 'noteType')).toEqual({
      n1: 'general',
      n2: 'prayer_request',
    });
    expect(await column('member_tags', 'category')).toEqual({ t1: 'general', t2: 'demographic' });
  });

  it('collapses rows that normalising made duplicates under a unique index', async () => {
    // a1 ('Sunday Service') and a2 ('sunday_service') are one service: a2 already held the
    // canonical value, so it is kept, present is true because a1 was, and it holds both notes.
    // a5 and a6 both become 'other': the older a5 is kept and keeps both legacy labels.
    expect(
      await rows<{ id: string; serviceType: string; present: boolean; notes: string | null }>(
        `SELECT "id", "serviceType"::text AS "serviceType", "present", "notes" FROM "$s"."attendance" ORDER BY "id"`,
      ),
    ).toEqual([
      {
        id: 'a2',
        serviceType: 'sunday_service',
        present: true,
        notes: 'arrived late\nbrought a guest',
      },
      { id: 'a3', serviceType: 'other', present: true, notes: 'Legacy service type: youth night' },
      { id: 'a4', serviceType: 'bible_study', present: false, notes: null },
      {
        id: 'a5',
        serviceType: 'other',
        present: true,
        notes: 'youth A\nLegacy service type: Youth Night\nchoir B\nLegacy service type: choir',
      },
    ]);
    expect(
      await rows<{ id: string; relationshipType: string; isActive: boolean }>(
        `SELECT "id", "relationshipType"::text AS "relationshipType", "isActive"
         FROM "$s"."family_relationships" ORDER BY "id"`,
      ),
    ).toEqual([
      { id: 'r2', relationshipType: 'spouse', isActive: true },
      { id: 'r3', relationshipType: 'other', isActive: true },
    ]);
  });

  it('copies every collapsed row, unchanged, into phase3_archive', async () => {
    const attendance = await archivedRows(schema, 'attendance');
    expect(
      attendance.map(({ id, row, migration, reason }) => ({
        id,
        notes: row.notes,
        serviceType: row.serviceType,
        migration,
        reason,
      })),
    ).toEqual([
      {
        id: 'a1',
        notes: 'arrived late',
        serviceType: 'Sunday Service',
        migration: '20261006010000_enum_columns',
        reason: 'collapsed into attendance row a2 (same member, time and service type)',
      },
      {
        id: 'a6',
        notes: ' choir B ',
        serviceType: 'choir',
        migration: '20261006010000_enum_columns',
        reason: 'collapsed into attendance row a5 (same member, time and service type)',
      },
    ]);
    const relationships = await archivedRows(schema, 'family_relationships');
    expect(
      relationships.map(({ id, row, reason }) => ({ id, type: row.relationshipType, reason })),
    ).toEqual([
      {
        id: 'r1',
        type: 'Spouse',
        reason: 'collapsed into family_relationships row r2 (same pair and type)',
      },
    ]);
  });

  it('records every value that was mapped to a fallback, and only those', async () => {
    expect(await valueChanges(schema)).toEqual([
      'attendance.serviceType:a3 youth night -> other',
      'attendance.serviceType:a5 Youth Night -> other',
      'attendance.serviceType:a6 choir -> other',
      'family_relationships.relationshipType:r3 cousin -> other',
      'group_members.role:gm3 captain -> member',
      'groups.type:g2 book club -> ministry',
      'media.type:m1 VIDEO -> YOUTUBE_VIDEO',
      'member_activities.activityType:act1 group_participation -> other',
      'member_engagement.membershipStage:e2 champion -> visitor',
      'member_engagement.riskLevel:e2 severe -> low',
      'member_interactions.category:i1 random -> null',
      'member_interactions.channel:i1 Fax -> in_person',
      'member_interactions.interactionType:i1 letter -> note_added',
      'member_interactions.priority:i1 whatever -> normal',
      'member_interactions.status:i1 pending -> completed',
      'member_milestones.category:ms1 academic -> general',
      'member_milestones.impact:ms1 huge -> medium',
      'member_milestones.milestoneType:ms1 graduation -> other',
      'member_notes.noteType:n1 random -> general',
      'member_tags.category:t1 mystery -> general',
      'users.gender:u2 M -> other',
      'users.maritalStatus:u2 complicated -> null',
      'users.membershipType:u2 guest -> null',
    ]);
  });

  it('keeps the column defaults as enum values and drops its helper function', async () => {
    const defaults = await rows<{ column_name: string; column_default: string }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_schema = '$s' AND table_name = 'group_members' AND column_name = 'role'`,
    );
    expect(defaults[0]?.column_default).toBe(`'member'::${schema}."GroupMemberRole"`);
    const helpers = await rows<{ n: bigint }>(
      `SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
       WHERE ns.nspname = '$s' AND p.proname = 'phase3_enum_norm'`,
    );
    expect(Number(helpers[0]?.n)).toBe(0);
  });
});

describe('20261005000000_engagement_rows_for_all_users (Phase 2 backfill)', () => {
  const schema = 'fixture_p2_engagement_backfill';
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));
  const migration = '20261005000000_engagement_rows_for_all_users';

  beforeAll(() => {
    migrateFixture(
      schema,
      migration,
      `
      INSERT INTO "users" ("id", "email", "password", "name", "updatedAt", "isActive") VALUES
        ('ua', 'ua@example.org', 'x', 'A', now(), true),
        ('ub', 'ub@example.org', 'x', 'B', now(), true),
        ('uc', 'uc@example.org', 'x', 'C', now(), false);
      INSERT INTO "member_engagement" ("id", "userId", "updatedAt", "engagementScore", "membershipStage") VALUES
        ('keep', 'ua', now(), 72, 'core_member');
      `,
    );
  }, 60_000);

  afterAll(() => dropSchema(schema));

  it('adds a default row for every user lacking one, keeps existing rows and can run again', async () => {
    const read = () =>
      rows<{ id: string; userId: string; engagementScore: number; membershipStage: string }>(
        `SELECT "id", "userId", "engagementScore", "membershipStage"
         FROM "$s"."member_engagement" ORDER BY "userId"`,
      );
    const first = await read();
    expect(first.map((r) => r.userId)).toEqual(['ua', 'ub', 'uc']);
    expect(first[0]).toEqual({
      id: 'keep',
      userId: 'ua',
      engagementScore: 72,
      membershipStage: 'core_member',
    });
    for (const row of first.slice(1)) {
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row).toMatchObject({ engagementScore: 0, membershipStage: 'visitor' });
    }
    execute(`SET search_path TO "${schema}";\n${migrationSql(migration)}`);
    expect(await read()).toEqual(first);
  });
});

describe('20261006020000_relations_keys_indexes (D3)', () => {
  const schema = 'fixture_d3_relations';
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));

  beforeAll(() => {
    migrateFixture(
      schema,
      '20261006020000_relations_keys_indexes',
      `
      INSERT INTO "roles" ("id", "name", "permissions") VALUES ('role_admin', 'admin', '[]'), ('role_member', 'member', '[]');
      INSERT INTO "families" ("id", "familyName", "headOfFamily", "updatedAt") VALUES
        ('f1', 'Flagged', NULL, now()),
        ('f2', 'Headed', 'u3', now()),
        ('f3', 'Ghosted', 'ghost', now());
      INSERT INTO "users" ("id", "email", "password", "name", "createdAt", "updatedAt", "familyId", "isHeadOfFamily") VALUES
        ('u1', 'u1@example.org', 'x', 'U1', '2019-01-01', now(), 'f1', true),
        ('u2', 'u2@example.org', 'x', 'U2', '2020-01-01', now(), 'f1', true),
        ('u3', 'u3@example.org', 'x', 'U3', '2021-01-01', now(), 'f2', false),
        ('u4', 'u4@example.org', 'x', 'U4', '2022-01-01', now(), 'f2', true),
        ('admin_old', 'old@example.org', 'x', 'Old admin', '2019-06-01', now(), NULL, false),
        ('admin_new', 'new@example.org', 'x', 'New admin', '2023-01-01', now(), NULL, false);
      INSERT INTO "user_roles" ("id", "userId", "roleId") VALUES
        ('ur1', 'admin_new', 'role_admin'), ('ur2', 'admin_old', 'role_admin'), ('ur3', 'u1', 'role_member');
      INSERT INTO "member_engagement" ("id", "userId", "updatedAt", "engagementScore") VALUES
        ('e1', 'u1', now(), 40), ('e2', 'u2', now(), 10);
      INSERT INTO "media" ("id", "title", "type", "url", "tags", "uploadedById", "updatedAt") VALUES
        ('m1', 'Sermon', 'YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '[]', 'u1', now());
      INSERT INTO "groups" ("id", "name", "type", "leaderId", "updatedAt") VALUES
        ('g1', 'Choir', 'ministry', 'u1', now()),
        ('g2', 'Gone', 'ministry', 'ghost', now());
      INSERT INTO "member_interactions" ("id", "userId", "interactionType", "channel", "staffMemberId") VALUES
        ('i1', 'u1', 'call_made', 'phone', 'u2'),
        ('i2', 'u1', 'call_made', 'phone', 'ghost');
      INSERT INTO "member_tags" ("id", "name") VALUES ('t1', 'Youth');
      INSERT INTO "user_tags" ("id", "userId", "tagId", "addedBy") VALUES
        ('ut1', 'u1', 't1', 'u2'),
        ('ut2', 'u2', 't1', 'ghost');
      INSERT INTO "saved_searches" ("id", "name", "query", "createdBy", "updatedAt") VALUES
        ('s1', 'Mine', '{}', 'u1', now()),
        ('s2', 'Orphan', '{}', 'ghost', now());
      INSERT INTO "member_notes" ("id", "userId", "authorId", "content", "updatedAt") VALUES
        ('n1', 'u1', 'u2', 'kept', now()),
        ('n2', 'u1', 'ghost', 'repointed', now());
      INSERT INTO "family_relationships" ("id", "primaryUserId", "relatedUserId", "relationshipType", "isActive", "familyId", "createdAt", "updatedAt") VALUES
        ('fr1', 'u2', 'u1', 'parent', true, 'f1', '2026-01-01', now()),
        ('fr2', 'u1', 'u2', 'child', false, 'f1', '2026-01-05', now()),
        ('fr3', 'u3', 'u1', 'grandparent', true, 'f1', '2026-01-01', now()),
        ('fr4', 'u4', 'u2', 'sibling', true, 'f1', '2026-01-02', now()),
        ('fr5', 'u4', 'u2', 'spouse', false, 'f1', '2026-01-01', now()),
        ('fr6', 'u1', 'u4', 'spouse', true, 'f1', '2026-01-01', now());
      `,
    );
  }, 60_000);

  afterAll(() => dropSchema(schema));

  const column = async (table: string, col: string) =>
    Object.fromEntries(
      (
        await rows<{ id: string; v: string | null }>(
          `SELECT "id", "${col}"::text AS v FROM "$s"."${table}" ORDER BY "id"`,
        )
      ).map(({ id, v }) => [id, v]),
    );

  it('renames the reference columns and drops isHeadOfFamily and the engagement id', async () => {
    const cols = await rows<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = '$s' AND (
         (table_name = 'families' AND column_name IN ('headOfFamily', 'headOfFamilyId')) OR
         (table_name = 'saved_searches' AND column_name IN ('createdBy', 'createdById')) OR
         (table_name = 'user_tags' AND column_name IN ('addedBy', 'addedById')) OR
         (table_name = 'users' AND column_name = 'isHeadOfFamily') OR
         (table_name = 'member_engagement' AND column_name = 'id'))
       ORDER BY table_name, column_name`,
    );
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      'families.headOfFamilyId',
      'saved_searches.createdById',
      'user_tags.addedById',
    ]);
    const pk = await rows<{ column_name: string }>(
      `SELECT k.column_name FROM information_schema.table_constraints c
       JOIN information_schema.key_column_usage k
         ON k.constraint_name = c.constraint_name AND k.table_schema = c.table_schema
       WHERE c.table_schema = '$s' AND c.table_name = 'member_engagement'
         AND c.constraint_type = 'PRIMARY KEY'`,
    );
    expect(pk).toEqual([{ column_name: 'userId' }]);
    expect(
      await rows<{ userId: string; engagementScore: number }>(
        `SELECT "userId", "engagementScore" FROM "$s"."member_engagement" ORDER BY "userId"`,
      ),
    ).toEqual([
      { userId: 'u1', engagementScore: 40 },
      { userId: 'u2', engagementScore: 10 },
    ]);
  });

  it('derives the head of family and clears dangling references', async () => {
    // f1 had no head: its oldest member flagged isHeadOfFamily (u1) takes it. f2 keeps u3.
    expect(await column('families', 'headOfFamilyId')).toEqual({ f1: 'u1', f2: 'u3', f3: null });
    expect(await column('groups', 'leaderId')).toEqual({ g1: 'u1', g2: null });
    expect(await column('member_interactions', 'staffMemberId')).toEqual({ i1: 'u2', i2: null });
    expect(await column('user_tags', 'addedById')).toEqual({ ut1: 'u2', ut2: null });
    expect(await column('media', 'uploadedById')).toEqual({ m1: 'u1' });
  });

  it('repoints dangling note authors to the oldest admin and deletes ownerless searches', async () => {
    expect(await column('member_notes', 'authorId')).toEqual({ n1: 'u2', n2: 'admin_old' });
    expect(await column('saved_searches', 'createdById')).toEqual({ s1: 'u1' });
  });

  it('records every changed reference and archives every deleted row', async () => {
    expect(await valueChanges(schema)).toEqual([
      'families.headOfFamilyId:f3 ghost -> null',
      'groups.leaderId:g2 ghost -> null',
      'member_interactions.staffMemberId:i2 ghost -> null',
      'member_notes.authorId:n2 ghost -> admin_old',
      'user_tags.addedById:ut2 ghost -> null',
    ]);
    const searches = await archivedRows(schema, 'saved_searches');
    expect(
      searches.map(({ id, row, reason }) => ({
        id,
        name: row.name,
        owner: row.createdById,
        reason,
      })),
    ).toEqual([{ id: 's2', name: 'Orphan', owner: 'ghost', reason: 'owner missing' }]);
    const pairs = await archivedRows(schema, 'family_relationships');
    expect(pairs.map(({ id, migration, reason }) => ({ id, migration, reason }))).toEqual([
      {
        id: 'fr1',
        migration: '20261006020000_relations_keys_indexes',
        reason:
          'collapsed into family_relationships row fr2 (same pair; type already in the new meaning)',
      },
      {
        id: 'fr4',
        migration: '20261006020000_relations_keys_indexes',
        reason:
          'collapsed into family_relationships row fr5 (same pair; type already in the new meaning)',
      },
    ]);
  });

  it('stores each family pair once with primaryUserId < relatedUserId', async () => {
    expect(
      await rows<{
        id: string;
        primaryUserId: string;
        relatedUserId: string;
        relationshipType: string;
        isActive: boolean;
      }>(
        `SELECT "id", "primaryUserId", "relatedUserId", "relationshipType"::text AS "relationshipType", "isActive"
         FROM "$s"."family_relationships" ORDER BY "id"`,
      ),
    ).toEqual([
      // Legacy rows meant "related is the primary's <type>": fr1 (u2, u1, 'parent') says u1 is
      // u2's parent and its mirror fr2 (u1, u2, 'child') says u2 is u1's child. In the new meaning
      // (the primary's relation to the related user) that is (u1, u2, 'parent'); the canonical fr2
      // is kept, active because fr1 was.
      {
        id: 'fr2',
        primaryUserId: 'u1',
        relatedUserId: 'u2',
        relationshipType: 'parent',
        isActive: true,
      },
      // fr3 (u3, u1, 'grandparent') said u1 is u3's grandparent: (u1, u3, 'grandparent').
      {
        id: 'fr3',
        primaryUserId: 'u1',
        relatedUserId: 'u3',
        relationshipType: 'grandparent',
        isActive: true,
      },
      // fr4 and fr5 name the same pair the other way round: the older fr5 wins and is swapped.
      {
        id: 'fr5',
        primaryUserId: 'u2',
        relatedUserId: 'u4',
        relationshipType: 'spouse',
        isActive: true,
      },
      {
        id: 'fr6',
        primaryUserId: 'u1',
        relatedUserId: 'u4',
        relationshipType: 'spouse',
        isActive: true,
      },
    ]);
  });

  it('adds the foreign keys with their delete rules', async () => {
    const fks = await rows<{ conname: string; rule: string }>(
      `SELECT c.conname, c.confdeltype::text AS rule FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = '$s' AND c.contype = 'f' AND c.conname = ANY (ARRAY[
         'media_uploadedById_fkey', 'families_headOfFamilyId_fkey', 'groups_leaderId_fkey',
         'member_interactions_staffMemberId_fkey', 'member_notes_authorId_fkey',
         'user_tags_addedById_fkey', 'saved_searches_createdById_fkey'])
       ORDER BY c.conname`,
    );
    // pg_constraint.confdeltype: n = SET NULL, r = RESTRICT, c = CASCADE.
    expect(Object.fromEntries(fks.map((f) => [f.conname, f.rule]))).toEqual({
      families_headOfFamilyId_fkey: 'n',
      groups_leaderId_fkey: 'n',
      media_uploadedById_fkey: 'n',
      member_interactions_staffMemberId_fkey: 'n',
      member_notes_authorId_fkey: 'r',
      saved_searches_createdById_fkey: 'c',
      user_tags_addedById_fkey: 'n',
    });
  });
});

describe('20261006020000_relations_keys_indexes (D3) without an admin', () => {
  const schema = 'fixture_d3_no_admin';

  afterAll(() => dropSchema(schema));

  it('stops with a clear error instead of giving orphaned notes to a non-admin', () => {
    expect(() =>
      migrateFixture(
        schema,
        '20261006020000_relations_keys_indexes',
        `
        INSERT INTO "roles" ("id", "name", "permissions") VALUES ('role_leader', 'leader', '[]');
        INSERT INTO "users" ("id", "email", "password", "name", "createdAt", "updatedAt") VALUES
          ('oldest', 'oldest@example.org', 'x', 'Oldest', '2019-01-01', now()),
          ('u1', 'u1@example.org', 'x', 'U1', '2020-01-01', now());
        INSERT INTO "user_roles" ("id", "userId", "roleId") VALUES ('ur1', 'oldest', 'role_leader');
        INSERT INTO "member_notes" ("id", "userId", "authorId", "content", "isPrivate", "updatedAt") VALUES
          ('n1', 'u1', 'ghost', 'private pastoral note', true, now());
        `,
      ),
    ).toThrow(
      /1 note\(s\) reference a missing author and there is no admin account to own them; create an admin and rerun the migration/,
    );
  }, 60_000);
});

/** JSON text nested `depth` objects deep: {"a":{"a":...1...}}. */
const nestedJson = (depth: number) => `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;

describe('20261006030000_native_column_types (D4)', () => {
  const schema = 'fixture_d4_native_types';
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));

  beforeAll(() => {
    migrateFixture(
      schema,
      '20261006030000_native_column_types',
      `
      INSERT INTO "roles" ("id", "name", "permissions") VALUES
        ('r1', 'admin', '["*"]'),
        ('r2', 'leader', '["members:read", " media:write ", 7, null, "", {"a": 1}]'),
        ('r3', 'member', 'not json'),
        ('r4', 'guest', '{"read": true}');
      INSERT INTO "users" ("id", "email", "password", "name", "updatedAt", "volunteerSkills", "interests") VALUES
        ('u1', 'u1@example.org', 'x', 'U1', now(), '["Music", "Teaching"]', '["Hiking"]'),
        ('u2', 'u2@example.org', 'x', 'U2', now(), 'Music, Teaching', ''),
        ('u3', 'u3@example.org', 'x', 'U3', now(), NULL, '"Hiking"'),
        ('u4', 'u4@example.org', 'x', 'U4', now(), '[]', 'null');
      INSERT INTO "media" ("id", "title", "type", "url", "tags", "uploadedById", "updatedAt") VALUES
        ('m1', 'Kept', 'YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '["worship","youth"]', 'u1', now()),
        ('m2', 'Broken', 'YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '[worship', 'u1', now()),
        ('m3', 'Blank', 'YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '', 'u1', now());
      INSERT INTO "member_activities" ("id", "userId", "activityType", "metadata") VALUES
        ('a1', 'u1', 'volunteer', '{"hours": 3}'),
        ('a2', 'u1', 'volunteer', '{hours: 3}'),
        ('a3', 'u1', 'volunteer', NULL),
        ('a4', 'u1', 'volunteer', 'null'),
        ('a5', 'u1', 'volunteer', '   '),
        ('a6', 'u1', 'volunteer', '${nestedJson(63)}');
      INSERT INTO "member_interactions" ("id", "userId", "interactionType", "channel", "metadata") VALUES
        ('i1', 'u1', 'call_made', 'phone', '{"duration": 12, "tags": ["a"]}'),
        ('i2', 'u1', 'call_made', 'phone', 'oops'),
        ('i3', 'u1', 'call_made', 'phone', '${nestedJson(200)}'),
        ('i4', 'u1', 'call_made', 'phone', '{"note": "\\u0000"}');
      INSERT INTO "saved_searches" ("id", "name", "query", "createdById", "updatedAt") VALUES
        ('s1', 'Valid', '{"conditions":[{"field":"name","operator":"contains","value":"a"}],"logic":"AND"}', 'u1', now()),
        ('s2', 'Stale', '{"conditions":[{"field":"age","operator":"gt","value":30}]}', 'u1', now()),
        ('s3', 'Broken', '{not json', 'u1', now()),
        ('s4', 'Empty', '', 'u2', now()),
        ('s5', 'Deep', '${nestedJson(200)}', 'u1', now());
      `,
    );
  }, 60_000);

  afterAll(() => dropSchema(schema));

  const values = async <V>(table: string, col: string) =>
    Object.fromEntries(
      (
        await rows<{ id: string; v: V }>(
          `SELECT "id", "${col}" AS v FROM "$s"."${table}" ORDER BY "id"`,
        )
      ).map(({ id, v }) => [id, v]),
    );

  it('converts the columns to text[] and jsonb', async () => {
    const types = await rows<{ c: string; t: string }>(
      `SELECT table_name || '.' || column_name AS c, data_type AS t FROM information_schema.columns
       WHERE table_schema = '$s' AND (
         (table_name = 'users' AND column_name IN ('volunteerSkills', 'interests')) OR
         (table_name = 'media' AND column_name = 'tags') OR
         (table_name = 'roles' AND column_name = 'permissions') OR
         (table_name IN ('member_activities', 'member_interactions') AND column_name = 'metadata') OR
         (table_name = 'saved_searches' AND column_name = 'query'))
       ORDER BY 1`,
    );
    expect(types).toEqual([
      { c: 'media.tags', t: 'ARRAY' },
      { c: 'member_activities.metadata', t: 'jsonb' },
      { c: 'member_interactions.metadata', t: 'jsonb' },
      { c: 'roles.permissions', t: 'ARRAY' },
      { c: 'saved_searches.query', t: 'jsonb' },
      { c: 'users.interests', t: 'ARRAY' },
      { c: 'users.volunteerSkills', t: 'ARRAY' },
    ]);
  });

  it('parses JSON string lists; unparsable or non-array values become []', async () => {
    expect(await values<string[]>('roles', 'permissions')).toEqual({
      r1: ['*'],
      r2: ['members:read', 'media:write', '7'],
      r3: [],
      r4: [],
    });
    expect(await values<string[]>('users', 'volunteerSkills')).toEqual({
      u1: ['Music', 'Teaching'],
      u2: [],
      u3: [],
      u4: [],
    });
    expect(await values<string[]>('users', 'interests')).toEqual({
      u1: ['Hiking'],
      u2: [],
      u3: [],
      u4: [],
    });
    expect(await values<string[]>('media', 'tags')).toEqual({
      m1: ['worship', 'youth'],
      m2: [],
      m3: [],
    });
  });

  it('parses metadata; blank and JSON null become NULL, unparsable or too deep text is kept as a string', async () => {
    expect(await values<unknown>('member_activities', 'metadata')).toEqual({
      a1: { hours: 3 },
      a2: '{hours: 3}',
      a3: null,
      a4: null,
      a5: null,
      a6: JSON.parse(nestedJson(63)),
    });
    expect(await values<unknown>('member_interactions', 'metadata')).toEqual({
      i1: { duration: 12, tags: ['a'] },
      i2: 'oops',
      i3: nestedJson(200),
      i4: '{"note": "\\u0000"}',
    });
  });

  it('keeps parsable saved searches (stale ones too) and deletes the ones that do not parse or are too deep', async () => {
    expect(await values<unknown>('saved_searches', 'query')).toEqual({
      s1: { conditions: [{ field: 'name', operator: 'contains', value: 'a' }], logic: 'AND' },
      s2: { conditions: [{ field: 'age', operator: 'gt', value: 30 }] },
    });
  });

  it('copies every deleted saved search, query text included, into phase3_archive', async () => {
    const archived = await archivedRows(schema, 'saved_searches');
    expect(
      archived.map(({ id, row, migration, reason }) => ({
        id,
        query: row.query,
        owner: row.createdById,
        migration,
        reason,
      })),
    ).toEqual([
      {
        id: 's3',
        query: '{not json',
        owner: 'u1',
        migration: '20261006030000_native_column_types',
        reason: 'query is not JSON',
      },
      {
        id: 's4',
        query: '',
        owner: 'u2',
        migration: '20261006030000_native_column_types',
        reason: 'query is not JSON',
      },
      {
        id: 's5',
        query: nestedJson(200),
        owner: 'u1',
        migration: '20261006030000_native_column_types',
        reason: 'query nested 64 levels or deeper',
      },
    ]);
  });

  it('gives new rows an empty list and leaves no helper functions behind', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schema}"."users" ("id", "email", "password", "name", "updatedAt") VALUES ('u5', 'u5@example.org', 'x', 'U5', now())`,
    );
    const [fresh] = await rows<{ volunteerSkills: string[]; interests: string[] }>(
      `SELECT "volunteerSkills", "interests" FROM "$s"."users" WHERE "id" = 'u5'`,
    );
    expect(fresh).toEqual({ volunteerSkills: [], interests: [] });
    const helpers = await rows<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '$s' AND p.proname LIKE 'phase3_%'`,
    );
    expect(helpers).toEqual([]);
  });
});

describe('legacy JSON migrated to the head schema stays readable through Prisma', () => {
  const schema = 'fixture_d4_prisma_read';
  let client: PrismaClient;

  beforeAll(() => {
    migrateFixture(
      schema,
      '20261006030000_native_column_types',
      `
      INSERT INTO "users" ("id", "email", "password", "name", "updatedAt") VALUES
        ('u1', 'u1@example.org', 'x', 'U1', now());
      INSERT INTO "member_activities" ("id", "userId", "activityType", "metadata") VALUES
        ('a1', 'u1', 'volunteer', '${nestedJson(200)}');
      INSERT INTO "member_interactions" ("id", "userId", "interactionType", "channel", "metadata") VALUES
        ('i1', 'u1', 'call_made', 'phone', '${nestedJson(200)}'),
        ('i2', 'u1', 'call_made', 'phone', '{"note": "\\u0000"}');
      INSERT INTO "saved_searches" ("id", "name", "query", "createdById", "isPublic", "updatedAt") VALUES
        ('s1', 'Deep', '${nestedJson(200)}', 'u1', true, now());
      `,
      true,
    );
    client = new PrismaClient({ datasourceUrl: `${TEST_DATABASE_URL}?schema=${schema}` });
  }, 60_000);

  afterAll(async () => {
    await client.$disconnect();
    dropSchema(schema);
  });

  it('reads the member with interactions and activities, and the saved searches', async () => {
    const member = await client.user.findUnique({
      where: { id: 'u1' },
      include: { interactions: true, activities: true },
    });
    expect(member?.interactions.map((i) => i.metadata)).toEqual(
      expect.arrayContaining([nestedJson(200), '{"note": "\\u0000"}']),
    );
    expect(member?.activities.map((a) => a.metadata)).toEqual([nestedJson(200)]);
    expect(await client.savedSearch.findMany({ where: { isPublic: true } })).toEqual([]);
  });
});

describe('20261006040000_services_and_attendance (D5)', () => {
  const schema = 'fixture_d5_services';
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));

  beforeAll(() => {
    migrateFixture(
      schema,
      '20261006040000_services_and_attendance',
      `
      INSERT INTO "users" ("id", "email", "password", "name", "updatedAt") VALUES
        ('u1', 'u1@example.org', 'x', 'U1', now()),
        ('u2', 'u2@example.org', 'x', 'U2', now());
      -- a1/a2/a3: one member twice on the same Sunday (morning and evening) plus a third time
      -- with the same note; a4: another member that Sunday; a5: the same day, another type;
      -- a6: a bible study; a7: a later Sunday late in the evening (UTC date kept).
      INSERT INTO "attendance" ("id", "userId", "serviceDate", "serviceType", "present", "notes", "createdAt") VALUES
        ('a1', 'u1', '2026-01-04 10:00', 'sunday_service', false, 'early', '2026-01-04 10:05'),
        ('a2', 'u1', '2026-01-04 18:00', 'sunday_service', true, 'evening', '2026-01-04 18:05'),
        ('a3', 'u1', '2026-01-04 19:00', 'sunday_service', false, ' early ', '2026-01-04 19:05'),
        ('a4', 'u2', '2026-01-04 10:00', 'sunday_service', true, NULL, '2026-01-04 09:30'),
        ('a5', 'u1', '2026-01-04 12:00', 'other', true, NULL, '2026-01-04 12:05'),
        ('a6', 'u2', '2026-01-07 19:00', 'bible_study', false, NULL, '2026-01-07 19:05'),
        ('a7', 'u1', '2026-01-11 23:30', 'sunday_service', true, '', '2026-01-12 08:00');
      `,
    );
  }, 60_000);

  afterAll(() => dropSchema(schema));

  type ServiceRow = { id: string; date: string; type: string; createdAt: Date };
  const services = () =>
    rows<ServiceRow>(
      `SELECT "id", "date"::text AS date, "type"::text AS type, "createdAt" FROM "$s"."services" ORDER BY "date", "type"`,
    );

  it('creates one service per legacy date and type, dated by day', async () => {
    const all = await services();
    expect(all.map((s) => [s.date, s.type])).toEqual([
      ['2026-01-04', 'other'],
      ['2026-01-04', 'sunday_service'],
      ['2026-01-07', 'bible_study'],
      ['2026-01-11', 'sunday_service'],
    ]);
    // A cuid-shaped id, and the earliest createdAt of the rows the service groups.
    for (const s of all) expect(s.id).toMatch(/^c[0-9a-f]{24}$/);
    expect(all[1]!.createdAt.toISOString()).toBe('2026-01-04T09:30:00.000Z');
  });

  it('repoints every row and collapses same-day duplicates into the oldest row', async () => {
    const attendance = await rows<{
      id: string;
      userId: string;
      date: string;
      type: string;
      present: boolean;
      notes: string | null;
      recordedById: string | null;
    }>(
      `SELECT a."id", a."userId", s."date"::text AS date, s."type"::text AS type, a."present", a."notes", a."recordedById"
       FROM "$s"."attendance" a JOIN "$s"."services" s ON s."id" = a."serviceId" ORDER BY a."id"`,
    );
    expect(attendance).toEqual([
      {
        id: 'a1',
        userId: 'u1',
        date: '2026-01-04',
        type: 'sunday_service',
        present: true,
        notes: 'early\nevening',
        recordedById: null,
      },
      {
        id: 'a4',
        userId: 'u2',
        date: '2026-01-04',
        type: 'sunday_service',
        present: true,
        notes: null,
        recordedById: null,
      },
      {
        id: 'a5',
        userId: 'u1',
        date: '2026-01-04',
        type: 'other',
        present: true,
        notes: null,
        recordedById: null,
      },
      {
        id: 'a6',
        userId: 'u2',
        date: '2026-01-07',
        type: 'bible_study',
        present: false,
        notes: null,
        recordedById: null,
      },
      {
        id: 'a7',
        userId: 'u1',
        date: '2026-01-11',
        type: 'sunday_service',
        present: true,
        notes: '',
        recordedById: null,
      },
    ]);
  });

  it('copies the collapsed duplicates, unchanged, into phase3_archive', async () => {
    const archived = await archivedRows(schema, 'attendance');
    expect(
      archived.map(({ id, row, migration, reason }) => ({
        id,
        notes: row.notes,
        present: row.present,
        migration,
        reason,
      })),
    ).toEqual([
      {
        id: 'a2',
        notes: 'evening',
        present: true,
        migration: '20261006040000_services_and_attendance',
        reason: 'collapsed into attendance row a1 (same member and service day)',
      },
      {
        id: 'a3',
        notes: ' early ',
        present: false,
        migration: '20261006040000_services_and_attendance',
        reason: 'collapsed into attendance row a1 (same member and service day)',
      },
    ]);
  });

  it('drops the legacy columns and enforces the new keys and delete rules', async () => {
    const columns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = '$s' AND table_name = 'attendance' ORDER BY column_name`,
    );
    expect(columns.map((c) => c.column_name)).toEqual([
      'createdAt',
      'id',
      'notes',
      'present',
      'recordedById',
      'serviceId',
      'userId',
    ]);

    const sunday = (await services())[1];
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."attendance" ("id", "userId", "serviceId") VALUES ('dup', 'u1', '${sunday!.id}')`,
      ),
    ).rejects.toThrow(/23505/);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."services" ("id", "date", "type") VALUES ('cdup', '2026-01-04', 'sunday_service')`,
      ),
    ).rejects.toThrow(/23505/);

    await prisma.$executeRawUnsafe(
      `DELETE FROM "${schema}"."services" WHERE "id" = '${sunday!.id}'`,
    );
    const left = await rows<{ id: string }>(`SELECT "id" FROM "$s"."attendance" ORDER BY "id"`);
    expect(left.map((r) => r.id)).toEqual(['a5', 'a6', 'a7']);
  });
});

describe('20261006050000_engagement_rules_and_snapshots (D6)', () => {
  const schema = 'fixture_d6_engagement';
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));

  beforeAll(() => {
    migrateFixture(
      schema,
      '20261006050000_engagement_rules_and_snapshots',
      `
      INSERT INTO "users" ("id", "email", "password", "name", "updatedAt") VALUES
        ('u1', 'u1@example.org', 'x', 'U1', now()),
        ('u2', 'u2@example.org', 'x', 'U2', now());
      INSERT INTO "member_engagement" ("userId", "updatedAt", "engagementScore", "attendanceScore",
        "givingScore", "volunteerScore", "communityScore", "communicationScore",
        "servicesAttended", "volunteerHours", "donationCount", "groupMeetings",
        "membershipStage", "riskLevel") VALUES
        ('u1', now(), 64, 80, 50, 40, 60, 75, 9, 12.5, 4, 0, 'core_member', 'low'),
        ('u2', now(), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'visitor', 'medium');
      `,
    );
  }, 60_000);

  afterAll(() => dropSchema(schema));

  it('drops the giving and volunteer columns and keeps every row and the remaining values', async () => {
    const columns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = '$s' AND table_name = 'member_engagement'`,
    );
    const names = columns.map((c) => c.column_name);
    for (const gone of [
      'givingScore',
      'volunteerScore',
      'volunteerHours',
      'donationCount',
      'groupMeetings',
    ])
      expect(names).not.toContain(gone);
    expect(
      await rows(
        `SELECT "userId", "engagementScore", "attendanceScore", "communityScore", "communicationScore",
                "servicesAttended", "membershipStage"::text AS stage, "riskLevel"::text AS risk
         FROM "$s"."member_engagement" ORDER BY "userId"`,
      ),
    ).toEqual([
      {
        userId: 'u1',
        engagementScore: 64,
        attendanceScore: 80,
        communityScore: 60,
        communicationScore: 75,
        servicesAttended: 9,
        stage: 'core_member',
        risk: 'low',
      },
      {
        userId: 'u2',
        engagementScore: 0,
        attendanceScore: 0,
        communityScore: 0,
        communicationScore: 0,
        servicesAttended: 0,
        stage: 'visitor',
        risk: 'medium',
      },
    ]);
  });

  it('creates an empty snapshot table keyed by member and month, deleted with the member', async () => {
    expect(await rows(`SELECT * FROM "$s"."engagement_snapshots"`)).toEqual([]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schema}"."engagement_snapshots" ("id", "userId", "month", "engagementScore",
        "attendanceScore", "communityScore", "communicationScore", "membershipStage", "riskLevel", "updatedAt")
       VALUES ('s1', 'u1', '2026-10-01', 1, 1, 1, 1, 'visitor', 'low', now())`,
    );
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "${schema}"."engagement_snapshots" ("id", "userId", "month", "engagementScore",
          "attendanceScore", "communityScore", "communicationScore", "membershipStage", "riskLevel", "updatedAt")
         VALUES ('s2', 'u1', '2026-10-01', 2, 2, 2, 2, 'visitor', 'low', now())`,
      ),
    ).rejects.toThrow();
    await prisma.$executeRawUnsafe(`DELETE FROM "${schema}"."users" WHERE "id" = 'u1'`);
    expect(await rows(`SELECT * FROM "$s"."engagement_snapshots"`)).toEqual([]);
  });
});

// The whole chain (PHASE3_SPECS.md D8): a database as Phase 2 left it (the first two migrations,
// recorded in _prisma_migrations the way `migrate deploy` recorded them there), holding every
// legacy shape at once, upgraded by `prisma migrate deploy` itself rather than by replaying SQL.
describe('a Phase 2 database upgraded by prisma migrate deploy (whole chain)', () => {
  const schema = 'fixture_chain_phase2';
  const schemaUrl = `${TEST_DATABASE_URL}?schema=${schema}`;
  const phase2 = ['20261004000000_init_postgres', '20261005000000_engagement_rows_for_all_users'];
  const rows = <T>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql.replaceAll('$s', schema));
  const prismaCli = (args: string) =>
    execSync(`npx prisma ${args}`, {
      cwd: BACKEND,
      env: { ...process.env, DATABASE_URL: schemaUrl },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
  // The checksums Phase 2 databases recorded in _prisma_migrations (church_dev_phase2.sql).
  // `migrate deploy` skips applied migrations by name, so an edited Phase 2 file would reach fresh
  // databases but never real ones, and the baseline below would silently follow the edit.
  const PHASE2_CHECKSUMS: Record<string, string> = {
    '20261004000000_init_postgres':
      '177ffc1476b527c7910ccc1484862078542bec3f4511657f375c4ea2e8042985',
    '20261005000000_engagement_rows_for_all_users':
      '9b9d3730ef2531750a8e8c4c95c03ad9abebd040fa60d33b9692c9bf910f2e3c',
  };
  let deployOutput = '';

  it('starts from the Phase 2 migration files byte for byte as Phase 2 databases applied them', () => {
    const checksums = Object.fromEntries(
      phase2.map((name) => [
        name,
        // The raw bytes, as Prisma hashes them.
        createHash('sha256')
          .update(readFileSync(resolve(MIGRATIONS, name, 'migration.sql')))
          .digest('hex'),
      ]),
    );
    expect(checksums).toEqual(PHASE2_CHECKSUMS);
  });

  beforeAll(() => {
    expect(migrationNames.slice(0, 2)).toEqual(phase2);
    execute(
      [
        clearArchive(schema),
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
        `CREATE SCHEMA "${schema}";`,
        `SET search_path TO "${schema}";`,
        ...phase2.map(migrationSql),
        `
        INSERT INTO "roles" ("id", "name", "permissions") VALUES
          ('role_admin', 'admin', '["*"]'),
          ('role_leader', 'leader', '["members:read", " media:write ", 7]'),
          ('role_member', 'member', 'not json');
        INSERT INTO "families" ("id", "familyName", "headOfFamily", "familyEngagementScore", "totalMembers", "activeMembers", "updatedAt") VALUES
          ('f1', 'Doe', 'u1', 61.5, 3, 3, now()),
          ('f2', 'Ghost', 'ghost', 0, 0, 0, now());
        INSERT INTO "users" ("id", "email", "password", "name", "createdAt", "updatedAt", "gender", "maritalStatus", "membershipType", "familyId", "isHeadOfFamily", "volunteerSkills", "interests") VALUES
          ('admin', 'admin@example.org', 'x', 'Admin', '2019-01-01', now(), 'Male', 'married', 'member', NULL, false, NULL, NULL),
          ('u1', 'u1@example.org', 'x', 'U1', '2020-01-01', now(), 'Female', 'Married', 'Regular Attendee', 'f1', true, '["Music", "Teaching"]', '["Hiking"]'),
          ('u2', 'u2@example.org', 'x', 'U2', '2020-02-01', now(), 'M', 'complicated', 'guest', 'f1', true, 'Music, Teaching', ''),
          ('u3', 'u3@example.org', 'x', 'U3', '2020-03-01', now(), NULL, NULL, NULL, 'f1', false, NULL, 'null');
        INSERT INTO "user_roles" ("id", "userId", "roleId") VALUES
          ('ur1', 'admin', 'role_admin'), ('ur2', 'u1', 'role_leader'), ('ur3', 'u2', 'role_member');
        INSERT INTO "member_engagement" ("id", "userId", "updatedAt", "engagementScore", "attendanceScore", "givingScore", "volunteerScore", "communityScore", "communicationScore", "membershipStage", "riskLevel", "automationTriggers", "followUpRequired") VALUES
          ('e_admin', 'admin', now(), 10, 10, 0, 0, 0, 50, 'leader', 'low', NULL, false),
          ('e1', 'u1', now(), 72.5, 80, 90, 70, 60, 50, 'Core Member', 'HIGH', '["welcome"]', true),
          ('e2', 'u2', now(), 12, 5, 0, 0, 0, 50, 'champion', 'severe', 'not json', false),
          ('e3', 'u3', now(), 0, 0, 0, 0, 0, 50, 'new-member', 'low', NULL, false);
        INSERT INTO "media" ("id", "title", "type", "url", "tags", "uploadedById", "updatedAt") VALUES
          ('m1', 'Sermon', 'VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '["worship","youth"]', 'u1', now()),
          ('m2', 'Broken tags', 'YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=abcdefghijk', '[worship', 'u2', now());
        INSERT INTO "groups" ("id", "name", "type", "leaderId", "updatedAt") VALUES
          ('g1', 'Choir', 'Small Group', 'u1', now()),
          ('g2', 'Gone', 'book club', 'ghost', now());
        INSERT INTO "group_members" ("id", "userId", "groupId", "role") VALUES
          ('gm1', 'u1', 'g1', 'co-leader'), ('gm2', 'u2', 'g1', 'Leader'), ('gm3', 'u3', 'g1', 'captain');
        -- a1/a2: one member twice on the same Sunday, both with notes; a4: an unknown type.
        INSERT INTO "attendance" ("id", "userId", "serviceDate", "serviceType", "present", "notes", "createdAt") VALUES
          ('a1', 'u1', '2026-01-04 10:00', 'Sunday Service', false, 'arrived late', '2026-01-04 10:05'),
          ('a2', 'u1', '2026-01-04 18:00', 'sunday_service', true, 'evening', '2026-01-04 18:05'),
          ('a3', 'u2', '2026-01-04 10:00', 'sunday_service', true, NULL, '2026-01-04 09:30'),
          ('a4', 'u2', '2026-01-07 19:00', 'youth night', true, NULL, '2026-01-07 19:05'),
          ('a5', 'u3', '2026-01-07 19:00', 'Bible-Study', false, NULL, '2026-01-07 19:10');
        -- Mirrored pairs in both directions, in the legacy meaning (the related user's relation).
        INSERT INTO "family_relationships" ("id", "primaryUserId", "relatedUserId", "relationshipType", "isActive", "familyId", "createdAt", "updatedAt") VALUES
          ('fr1', 'u1', 'u2', 'parent', true, 'f1', '2026-01-01', now()),
          ('fr2', 'u2', 'u1', 'child', true, 'f1', '2026-01-02', now()),
          ('fr3', 'u3', 'u1', 'Spouse', true, 'f1', '2026-01-01', now()),
          ('fr4', 'u1', 'u3', 'spouse', false, 'f1', '2026-01-03', now());
        INSERT INTO "member_notes" ("id", "userId", "authorId", "content", "noteType", "updatedAt") VALUES
          ('n1', 'u1', 'admin', 'kept', 'Prayer Request', now()),
          ('n2', 'u1', 'ghost', 'repointed', 'random', now());
        INSERT INTO "member_interactions" ("id", "userId", "interactionType", "channel", "status", "category", "priority", "staffMemberId", "metadata") VALUES
          ('i1', 'u1', 'Call Made', 'In Person', 'completed', 'follow-up', 'urgent', 'admin', '{"duration": 12}'),
          ('i2', 'u1', 'letter', 'Fax', 'pending', 'random', 'whatever', 'ghost', 'oops'),
          ('i3', 'u2', 'email_sent', 'email', 'completed', NULL, 'normal', NULL, '${nestedJson(200)}');
        INSERT INTO "member_activities" ("id", "userId", "activityType", "metadata") VALUES
          ('act1', 'u1', 'Volunteer', '{"hours": 3}'),
          ('act2', 'u1', 'group_participation', '{hours: 3}');
        INSERT INTO "member_milestones" ("id", "userId", "milestoneType", "title", "achievedDate", "category", "impact") VALUES
          ('ms1', 'u1', 'Baptism', 'Baptised', '2026-01-01', 'Spiritual', 'HIGH'),
          ('ms2', 'u2', 'graduation', 'Graduated', '2026-01-01', 'academic', 'huge');
        INSERT INTO "member_tags" ("id", "name", "category") VALUES ('t1', 'Youth', 'Demographic'), ('t2', 'Mystery', 'mystery');
        INSERT INTO "user_tags" ("id", "userId", "tagId", "addedBy") VALUES ('ut1', 'u1', 't1', 'admin'), ('ut2', 'u2', 't2', 'ghost');
        INSERT INTO "saved_searches" ("id", "name", "query", "createdBy", "updatedAt") VALUES
          ('s1', 'Valid', '{"conditions":[{"field":"name","operator":"contains","value":"a"}],"logic":"AND"}', 'admin', now()),
          ('s2', 'Broken', '{not json', 'admin', now()),
          ('s3', 'Deep', '${nestedJson(200)}', 'admin', now()),
          ('s4', 'Orphan', '{}', 'ghost', now());
        INSERT INTO "lifecycle_rules" ("id", "name", "triggerCondition", "actionType", "actionData", "updatedAt") VALUES
          ('lr1', 'Welcome', '{}', 'email', '{}', now());
        INSERT INTO "timeline_activities" ("id", "userId", "activityDate", "activityType", "title", "category") VALUES
          ('ta1', 'u1', '2026-01-01', 'note', 'Old', 'general');
        `,
      ].join('\n'),
    );
    for (const name of phase2) prismaCli(`migrate resolve --applied ${name}`);
    deployOutput = prismaCli('migrate deploy');
  }, 180_000);

  afterAll(() => dropSchema(schema));

  const column = async (table: string, col: string) =>
    Object.fromEntries(
      (
        await rows<{ id: string; v: string | null }>(
          `SELECT "id", "${col}"::text AS v FROM "$s"."${table}" ORDER BY "id"`,
        )
      ).map(({ id, v }) => [id, v]),
    );

  it('applies every Phase 3 migration and reports the database up to date', async () => {
    expect(deployOutput).toContain('All migrations have been successfully applied.');
    const applied = await rows<{ name: string; finished: boolean; rolledBack: boolean }>(
      `SELECT "migration_name" AS name, "finished_at" IS NOT NULL AS finished,
         "rolled_back_at" IS NOT NULL AS "rolledBack"
       FROM "$s"."_prisma_migrations" ORDER BY "migration_name"`,
    );
    expect(applied).toEqual(
      migrationNames.map((name) => ({ name, finished: true, rolledBack: false })),
    );
    expect(prismaCli('migrate status')).toContain('Database schema is up to date!');
  });

  it('ends with exactly the schema a fresh database gets from the migrations', async () => {
    // The suite's own "public" schema was built from the same migrations on an empty database.
    const describeSchema = async (name: string) => {
      const strip = (text: string) => text.replaceAll(`"${name}".`, '').replaceAll(`${name}.`, '');
      const columns = await prisma.$queryRawUnsafe<{ d: string }[]>(
        `SELECT table_name || '.' || column_name || ':' || udt_name || ':' || is_nullable || ':' ||
           coalesce(column_default, '') AS d
         FROM information_schema.columns WHERE table_schema = $1 AND table_name <> '_prisma_migrations'
         ORDER BY 1`,
        name,
      );
      const indexes = await prisma.$queryRawUnsafe<{ d: string }[]>(
        `SELECT indexdef AS d FROM pg_indexes WHERE schemaname = $1 AND tablename <> '_prisma_migrations' ORDER BY indexname`,
        name,
      );
      const constraints = await prisma.$queryRawUnsafe<{ d: string }[]>(
        `SELECT c.conname || ' ' || pg_get_constraintdef(c.oid) AS d FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = $1 AND c.conname <> '_prisma_migrations_pkey' ORDER BY 1`,
        name,
      );
      // Enum types with their labels in order (columns above only name the type).
      const enums = await prisma.$queryRawUnsafe<{ d: string }[]>(
        `SELECT 'enum ' || t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS d
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = $1 GROUP BY t.typname ORDER BY 1`,
        name,
      );
      return [...columns, ...indexes, ...constraints, ...enums].map((r) => strip(r.d));
    };
    const upgraded = await describeSchema(schema);
    expect(upgraded.length).toBeGreaterThan(200);
    expect(upgraded.filter((d) => d.startsWith('enum '))).toContain(
      'enum ServiceType:sunday_service,bible_study,prayer_meeting,special_event,other',
    );
    expect(upgraded).toEqual(await describeSchema('public'));
  });

  it('drops the lifecycle and timeline tables and the giving and volunteer columns', async () => {
    const tables = await rows<{ t: string }>(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = '$s' ORDER BY 1`,
    );
    expect(tables.map((r) => r.t)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(lifecycle_rules|timeline_activities)$/)]),
    );
    expect(tables.map((r) => r.t)).toEqual(
      expect.arrayContaining(['services', 'engagement_snapshots']),
    );
    const engagement = await rows<Record<string, unknown>>(
      `SELECT * FROM "$s"."member_engagement" ORDER BY "userId"`,
    );
    for (const row of engagement) {
      for (const gone of ['id', 'givingScore', 'volunteerScore', 'automationTriggers'])
        expect(row).not.toHaveProperty(gone);
    }
    expect(
      engagement.map((e) => [e.userId, e.engagementScore, e.membershipStage, e.riskLevel]),
    ).toEqual([
      ['admin', 10, 'leader', 'low'],
      ['u1', 72.5, 'core_member', 'high'],
      ['u2', 12, 'visitor', 'low'],
      ['u3', 0, 'new_member', 'low'],
    ]);
  });

  it('normalises enum values, rewriting co-leader and mapping unknown values', async () => {
    expect(await column('users', 'gender')).toEqual({
      admin: 'male',
      u1: 'female',
      u2: 'other',
      u3: null,
    });
    expect(await column('users', 'membershipType')).toEqual({
      admin: 'member',
      u1: 'regular_attendee',
      u2: null,
      u3: null,
    });
    expect(await column('group_members', 'role')).toEqual({
      gm1: 'co_leader',
      gm2: 'leader',
      gm3: 'member',
    });
    expect(await column('groups', 'type')).toEqual({ g1: 'small_group', g2: 'ministry' });
    expect(await column('media', 'type')).toEqual({ m1: 'YOUTUBE_VIDEO', m2: 'YOUTUBE_VIDEO' });
    expect(await column('member_milestones', 'milestoneType')).toEqual({
      ms1: 'baptism',
      ms2: 'other',
    });
    expect(await column('member_interactions', 'channel')).toEqual({
      i1: 'in_person',
      i2: 'in_person',
      i3: 'email',
    });
    expect(await column('member_tags', 'category')).toEqual({ t1: 'demographic', t2: 'general' });
  });

  it('turns JSON strings into native lists and objects', async () => {
    const values = async <V>(table: string, col: string) =>
      Object.fromEntries(
        (
          await rows<{ id: string; v: V }>(
            `SELECT "id", "${col}" AS v FROM "$s"."${table}" ORDER BY "id"`,
          )
        ).map(({ id, v }) => [id, v]),
      );
    expect(await values('users', 'volunteerSkills')).toEqual({
      admin: [],
      u1: ['Music', 'Teaching'],
      u2: [],
      u3: [],
    });
    expect(await values('users', 'interests')).toEqual({
      admin: [],
      u1: ['Hiking'],
      u2: [],
      u3: [],
    });
    expect(await values('roles', 'permissions')).toEqual({
      role_admin: ['*'],
      role_leader: ['members:read', 'media:write', '7'],
      role_member: [],
    });
    expect(await values('media', 'tags')).toEqual({ m1: ['worship', 'youth'], m2: [] });
    expect(await values('member_interactions', 'metadata')).toEqual({
      i1: { duration: 12 },
      i2: 'oops',
      i3: nestedJson(200),
    });
    expect(await values('member_activities', 'metadata')).toEqual({
      act1: { hours: 3 },
      act2: '{hours: 3}',
    });
    expect(await values('saved_searches', 'query')).toEqual({
      s1: {
        conditions: [{ field: 'name', operator: 'contains', value: 'a' }],
        logic: 'AND',
      },
    });
  });

  it('repoints references: head of family, dangling ids and orphaned note authors', async () => {
    expect(await column('families', 'headOfFamilyId')).toEqual({ f1: 'u1', f2: null });
    expect(await column('groups', 'leaderId')).toEqual({ g1: 'u1', g2: null });
    expect(await column('member_notes', 'authorId')).toEqual({ n1: 'admin', n2: 'admin' });
    expect(await column('member_interactions', 'staffMemberId')).toEqual({
      i1: 'admin',
      i2: null,
      i3: null,
    });
    expect(await column('user_tags', 'addedById')).toEqual({ ut1: 'admin', ut2: null });
    expect(await column('saved_searches', 'createdById')).toEqual({ s1: 'admin' });
  });

  it('stores each family pair once, ordered and in the new meaning', async () => {
    expect(
      await rows(
        `SELECT "id", "primaryUserId", "relatedUserId", "relationshipType"::text AS type, "isActive"
         FROM "$s"."family_relationships" ORDER BY "id"`,
      ),
    ).toEqual([
      // u1 is u2's child: the legacy rows said u2 is u1's parent (fr1) and u1 is u2's child (fr2).
      { id: 'fr1', primaryUserId: 'u1', relatedUserId: 'u2', type: 'child', isActive: true },
      { id: 'fr4', primaryUserId: 'u1', relatedUserId: 'u3', type: 'spouse', isActive: true },
    ]);
  });

  it('builds services from the legacy attendance and collapses same-day duplicates', async () => {
    expect(
      await rows(
        `SELECT s."date"::text AS date, s."type"::text AS type, count(a."id")::int AS rows
         FROM "$s"."services" s LEFT JOIN "$s"."attendance" a ON a."serviceId" = s."id"
         GROUP BY s."id" ORDER BY 1, 2`,
      ),
    ).toEqual([
      { date: '2026-01-04', type: 'sunday_service', rows: 2 },
      { date: '2026-01-07', type: 'bible_study', rows: 1 },
      { date: '2026-01-07', type: 'other', rows: 1 },
    ]);
    expect(
      await rows(
        `SELECT a."id", a."userId", s."date"::text AS date, s."type"::text AS type, a."present", a."notes"
         FROM "$s"."attendance" a JOIN "$s"."services" s ON s."id" = a."serviceId" ORDER BY a."id"`,
      ),
    ).toEqual([
      {
        id: 'a1',
        userId: 'u1',
        date: '2026-01-04',
        type: 'sunday_service',
        present: true,
        notes: 'arrived late\nevening',
      },
      {
        id: 'a3',
        userId: 'u2',
        date: '2026-01-04',
        type: 'sunday_service',
        present: true,
        notes: null,
      },
      {
        id: 'a4',
        userId: 'u2',
        date: '2026-01-07',
        type: 'other',
        present: true,
        notes: 'Legacy service type: youth night',
      },
      {
        id: 'a5',
        userId: 'u3',
        date: '2026-01-07',
        type: 'bible_study',
        present: false,
        notes: null,
      },
    ]);
  });

  it('archives every deleted row and records every remapped value in phase3_archive', async () => {
    const archived = async (table: string) =>
      (await archivedRows(schema, table)).map((r) => ({
        id: r.id,
        migration: r.migration,
        row: r.row,
      }));
    expect(await archived('attendance')).toEqual([
      {
        id: 'a2',
        migration: '20261006040000_services_and_attendance',
        row: expect.objectContaining({ userId: 'u1', notes: 'evening', present: true }),
      },
    ]);
    expect(await archived('family_relationships')).toEqual([
      {
        id: 'fr2',
        migration: '20261006020000_relations_keys_indexes',
        row: expect.objectContaining({ primaryUserId: 'u2', relatedUserId: 'u1' }),
      },
      {
        id: 'fr3',
        migration: '20261006020000_relations_keys_indexes',
        row: expect.objectContaining({ primaryUserId: 'u3', relatedUserId: 'u1' }),
      },
    ]);
    expect(await archived('saved_searches')).toEqual([
      {
        id: 's2',
        migration: '20261006030000_native_column_types',
        row: expect.objectContaining({ name: 'Broken', query: '{not json' }),
      },
      {
        id: 's3',
        migration: '20261006030000_native_column_types',
        row: expect.objectContaining({ name: 'Deep', query: nestedJson(200) }),
      },
      {
        id: 's4',
        migration: '20261006020000_relations_keys_indexes',
        row: expect.objectContaining({ name: 'Orphan', createdById: 'ghost' }),
      },
    ]);
    expect(await valueChanges(schema)).toEqual([
      'attendance.serviceType:a4 youth night -> other',
      'families.headOfFamilyId:f2 ghost -> null',
      'group_members.role:gm3 captain -> member',
      'groups.leaderId:g2 ghost -> null',
      'groups.type:g2 book club -> ministry',
      'media.type:m1 VIDEO -> YOUTUBE_VIDEO',
      'member_activities.activityType:act2 group_participation -> other',
      'member_engagement.membershipStage:e2 champion -> visitor',
      'member_engagement.riskLevel:e2 severe -> low',
      'member_interactions.category:i2 random -> null',
      'member_interactions.channel:i2 Fax -> in_person',
      'member_interactions.interactionType:i2 letter -> note_added',
      'member_interactions.priority:i2 whatever -> normal',
      'member_interactions.staffMemberId:i2 ghost -> null',
      'member_interactions.status:i2 pending -> completed',
      'member_milestones.category:ms2 academic -> general',
      'member_milestones.impact:ms2 huge -> medium',
      'member_milestones.milestoneType:ms2 graduation -> other',
      'member_notes.authorId:n2 ghost -> admin',
      'member_notes.noteType:n2 random -> general',
      'member_tags.category:t2 mystery -> general',
      'user_tags.addedById:ut2 ghost -> null',
      'users.gender:u2 M -> other',
      'users.maritalStatus:u2 complicated -> null',
      'users.membershipType:u2 guest -> null',
    ]);
  });

  it('serves the upgraded data through the Prisma client', async () => {
    const client = new PrismaClient({ datasourceUrl: schemaUrl });
    try {
      const member = await client.user.findUnique({
        where: { id: 'u1' },
        include: { attendances: { include: { service: true } }, engagement: true },
      });
      expect(member?.volunteerSkills).toEqual(['Music', 'Teaching']);
      expect(member?.attendances.map((a) => [a.service.type, a.present])).toEqual([
        ['sunday_service', true],
      ]);
      expect(member?.engagement?.membershipStage).toBe('core_member');
    } finally {
      await client.$disconnect();
    }
  });
});
