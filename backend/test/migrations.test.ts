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
