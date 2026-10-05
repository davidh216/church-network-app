import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';

// Data-transforming migrations run against a fixture holding legacy values (PHASE3_SPECS.md 0.1).
// Each fixture lives in its own Postgres schema of the test database: the migrations before the
// one under test are applied there, the legacy rows are inserted, then the migration under test
// runs, all in one `prisma db execute` session with `search_path` pointing at the fixture schema.
const BACKEND = resolve(__dirname, '..');
const MIGRATIONS = resolve(BACKEND, 'prisma', 'migrations');
const TEST_DATABASE_URL = 'postgresql://church:church@localhost:5432/church_test';

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

/** Builds `schema` up to (not including) `migration`, loads `fixture`, then applies `migration`. */
function migrateFixture(schema: string, migration: string, fixture: string) {
  const index = migrationNames.indexOf(migration);
  if (index < 0) throw new Error(`unknown migration ${migration}`);
  const before = migrationNames.slice(0, index).map(migrationSql);
  execute(
    [
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
      `CREATE SCHEMA "${schema}";`,
      `SET search_path TO "${schema}";`,
      ...before,
      fixture,
      migrationSql(migration),
    ].join('\n'),
  );
}

const dropSchema = (schema: string) => execute(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);

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
        ('a1', 'u1', '2026-01-04', 'Sunday Service', true, '2026-01-04 10:00'),
        ('a2', 'u1', '2026-01-04', 'sunday_service', false, '2026-01-04 11:00'),
        ('a3', 'u1', '2026-01-07', 'youth night', true, '2026-01-07 19:00'),
        ('a4', 'u2', '2026-01-04', 'bible-study', false, '2026-01-04 09:00');
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
    // canonical value, so it is kept, and present is true because a1 was.
    expect(
      await rows<{ id: string; serviceType: string; present: boolean }>(
        `SELECT "id", "serviceType"::text AS "serviceType", "present" FROM "$s"."attendance" ORDER BY "id"`,
      ),
    ).toEqual([
      { id: 'a2', serviceType: 'sunday_service', present: true },
      { id: 'a3', serviceType: 'other', present: true },
      { id: 'a4', serviceType: 'bible_study', present: false },
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
      // fr1 mirrored fr2 (u2 is the parent of u1): the canonical fr2 is kept, active because fr1 was.
      {
        id: 'fr2',
        primaryUserId: 'u1',
        relatedUserId: 'u2',
        relationshipType: 'child',
        isActive: true,
      },
      // Swapped and inverted: u3 is the grandparent of u1.
      {
        id: 'fr3',
        primaryUserId: 'u1',
        relatedUserId: 'u3',
        relationshipType: 'grandchild',
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
        ('a5', 'u1', 'volunteer', '   ');
      INSERT INTO "member_interactions" ("id", "userId", "interactionType", "channel", "metadata") VALUES
        ('i1', 'u1', 'call_made', 'phone', '{"duration": 12, "tags": ["a"]}'),
        ('i2', 'u1', 'call_made', 'phone', 'oops');
      INSERT INTO "saved_searches" ("id", "name", "query", "createdById", "updatedAt") VALUES
        ('s1', 'Valid', '{"conditions":[{"field":"name","operator":"contains","value":"a"}],"logic":"AND"}', 'u1', now()),
        ('s2', 'Stale', '{"conditions":[{"field":"age","operator":"gt","value":30}]}', 'u1', now()),
        ('s3', 'Broken', '{not json', 'u1', now()),
        ('s4', 'Empty', '', 'u2', now());
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

  it('parses metadata; unparsable, blank and JSON null values become NULL', async () => {
    expect(await values<unknown>('member_activities', 'metadata')).toEqual({
      a1: { hours: 3 },
      a2: null,
      a3: null,
      a4: null,
      a5: null,
    });
    expect(await values<unknown>('member_interactions', 'metadata')).toEqual({
      i1: { duration: 12, tags: ['a'] },
      i2: null,
    });
  });

  it('keeps parsable saved searches (stale ones too) and deletes the ones that do not parse', async () => {
    expect(await values<unknown>('saved_searches', 'query')).toEqual({
      s1: { conditions: [{ field: 'name', operator: 'contains', value: 'a' }], logic: 'AND' },
      s2: { conditions: [{ field: 'age', operator: 'gt', value: 30 }] },
    });
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
