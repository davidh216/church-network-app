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
