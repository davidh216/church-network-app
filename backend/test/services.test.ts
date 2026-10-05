import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';
import { monthsBefore } from '../src/modules/services/service';

// Services and attendance (PHASE3_SPECS.md 1.4): the services module, the bulk attendance upsert,
// the member attendance summaries and their access rules.
let admin: string;
let leader: string;
let member: string;
let leaderId: string;
let memberId: string;
let otherId: string;
let inactiveId: string;

const MS_DAY = 24 * 60 * 60 * 1000;
/** The UTC calendar day `n` days ago as YYYY-MM-DD. */
const daysAgo = (n: number) => new Date(Date.now() - n * MS_DAY).toISOString().slice(0, 10);
const dbDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const api = (token: string) => ({
  get: (url: string) => request(app).get(url).set(bearer(token)),
  post: (url: string, body: object) => request(app).post(url).set(bearer(token)).send(body),
  put: (url: string, body: object) => request(app).put(url).set(bearer(token)).send(body),
  delete: (url: string) => request(app).delete(url).set(bearer(token)),
});

async function newService(date: string, type = 'sunday_service', title?: string) {
  const res = await api(leader).post('/api/services', { date, type, title });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.service as { id: string; date: string; type: string; presentCount: number };
}

describe('services and attendance', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'svc-admin@services.test.local', role: 'admin', name: 'Admin' });
    leaderId = (
      await createUser({ email: 'svc-leader@services.test.local', role: 'leader', name: 'Leader' })
    ).id;
    memberId = (
      await createUser({ email: 'svc-member@services.test.local', role: 'member', name: 'Member' })
    ).id;
    otherId = (
      await createUser({ email: 'svc-other@services.test.local', role: 'member', name: 'Other' })
    ).id;
    inactiveId = (
      await createUser({
        email: 'svc-inactive@services.test.local',
        role: 'member',
        name: 'Inactive',
        isActive: false,
      })
    ).id;
    admin = await login('svc-admin@services.test.local');
    leader = await login('svc-leader@services.test.local');
    member = await login('svc-member@services.test.local');
  });

  beforeEach(async () => {
    await prisma.attendance.deleteMany();
    await prisma.service.deleteMany();
  });

  describe('services', () => {
    it('creates a service dated by day, recording who created it', async () => {
      const res = await api(leader).post('/api/services', {
        date: '2026-09-06',
        title: '  Harvest  ',
      });
      expect(res.status).toBe(201);
      expect(res.body.service).toMatchObject({
        date: '2026-09-06',
        type: 'sunday_service',
        title: 'Harvest',
        notes: null,
        createdById: leaderId,
        presentCount: 0,
      });
    });

    it('allows one service per date and type (409 on create and on update)', async () => {
      await newService('2026-09-06');
      await newService('2026-09-06', 'bible_study');
      const dup = await api(leader).post('/api/services', { date: '2026-09-06' });
      expect(dup.status).toBe(409);
      expect(dup.body).toEqual({
        error: 'A service of this type already exists on that date',
        code: 'CONFLICT',
      });

      const other = await newService('2026-09-13');
      const clash = await api(leader).put(`/api/services/${other.id}`, { date: '2026-09-06' });
      expect(clash.status).toBe(409);
      expect(await prisma.service.count()).toBe(3);
    });

    it('validates the date, type and fields', async () => {
      for (const body of [
        {},
        { date: '2026-02-30' },
        { date: '06/09/2026' },
        { date: '2026-09-06', type: 'youth_night' },
        { date: '2026-09-06', title: 'x'.repeat(201) },
      ]) {
        const res = await api(leader).post('/api/services', body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.code).toBe('VALIDATION');
      }
    });

    it('updates fields, clears a blank title and reports a missing service as 404', async () => {
      const service = await newService('2026-09-06', 'sunday_service', 'Harvest');
      const res = await api(leader).put(`/api/services/${service.id}`, {
        title: '',
        notes: 'Guest speaker',
        type: 'special_event',
      });
      expect(res.status).toBe(200);
      expect(res.body.service).toMatchObject({
        date: '2026-09-06',
        type: 'special_event',
        title: null,
        notes: 'Guest speaker',
      });
      const missing = 'cmissingmissingmissing00';
      expect((await api(leader).put(`/api/services/${missing}`, { title: 'x' })).status).toBe(404);
      expect((await api(leader).get(`/api/services/${missing}`)).status).toBe(404);
      expect((await api(leader).get(`/api/services/${missing}/attendance`)).status).toBe(404);
      expect(
        (await api(leader).put(`/api/services/${missing}/attendance`, { present: [memberId] }))
          .status,
      ).toBe(404);
    });

    it('lists newest first with date, type and paging filters', async () => {
      await newService('2026-08-30');
      await newService('2026-09-06');
      await newService('2026-09-06', 'bible_study');
      await newService('2026-10-04');

      const all = await api(leader).get('/api/services');
      expect(all.body).toMatchObject({ total: 4, page: 1, pageSize: 50 });
      expect(
        all.body.services.map((s: { date: string; type: string }) => [s.date, s.type]),
      ).toEqual([
        ['2026-10-04', 'sunday_service'],
        ['2026-09-06', 'sunday_service'],
        ['2026-09-06', 'bible_study'],
        ['2026-08-30', 'sunday_service'],
      ]);

      const september = await api(leader).get('/api/services?from=2026-09-01&to=2026-09-30');
      expect(september.body.total).toBe(2);
      const studies = await api(leader).get('/api/services?type=bible_study');
      expect(studies.body.services).toHaveLength(1);
      const paged = await api(leader).get('/api/services?page=2&pageSize=3');
      expect(paged.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(paged.body.services).toHaveLength(1);

      const backwards = await api(leader).get('/api/services?from=2026-10-01&to=2026-09-01');
      expect(backwards.status).toBe(400);
    });

    it('lets only admins delete a service, which deletes its attendance', async () => {
      const service = await newService('2026-09-06');
      await api(leader).put(`/api/services/${service.id}/attendance`, { present: [memberId] });
      expect((await api(leader).delete(`/api/services/${service.id}`)).status).toBe(403);
      expect((await api(admin).delete(`/api/services/${service.id}`)).status).toBe(200);
      expect(await prisma.attendance.count()).toBe(0);
      expect((await api(admin).delete(`/api/services/${service.id}`)).status).toBe(404);
    });

    it('keeps services and attendance away from members', async () => {
      const service = await newService('2026-09-06');
      for (const res of [
        await api(member).get('/api/services'),
        await api(member).post('/api/services', { date: '2026-09-13' }),
        await api(member).get(`/api/services/${service.id}`),
        await api(member).get(`/api/services/${service.id}/attendance`),
        await api(member).put(`/api/services/${service.id}/attendance`, { present: [memberId] }),
        await api(member).get(`/api/member-details/${memberId}/attendance`),
      ])
        expect(res.status).toBe(403);
      expect(await prisma.attendance.count()).toBe(0);
    });
  });

  describe('attendance sheet', () => {
    it('lists every active member, and anyone already recorded, with their mark', async () => {
      const service = await newService('2026-09-06');
      await prisma.attendance.create({
        data: { userId: inactiveId, serviceId: service.id, present: true },
      });
      await api(leader).put(`/api/services/${service.id}/attendance`, {
        present: [memberId],
        absent: [otherId],
      });

      const res = await api(leader).get(`/api/services/${service.id}/attendance`);
      expect(res.status).toBe(200);
      expect(res.body.service).toMatchObject({ id: service.id, presentCount: 2 });
      expect(
        res.body.members.map(
          (m: { user: { name: string }; present: boolean; recorded: boolean }) => [
            m.user.name,
            m.present,
            m.recorded,
          ],
        ),
      ).toEqual([
        ['Admin', false, false],
        ['Inactive', true, true],
        ['Leader', false, false],
        ['Member', true, true],
        ['Other', false, true],
      ]);
      expect(Object.keys(res.body.members[0].user).sort()).toEqual(['avatar', 'id', 'name']);
    });

    it('upserts idempotently and leaves members in neither list untouched', async () => {
      const service = await newService('2026-09-06');
      const url = `/api/services/${service.id}/attendance`;
      const body = { present: [memberId, memberId], absent: [otherId] };

      const first = await api(leader).put(url, body);
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ success: true, present: 1, absent: 1 });
      const snapshot = await prisma.attendance.findMany({ orderBy: { userId: 'asc' } });

      const again = await api(leader).put(url, body);
      expect(again.body).toEqual({ success: true, present: 1, absent: 1 });
      expect(await prisma.attendance.findMany({ orderBy: { userId: 'asc' } })).toEqual(snapshot);
      expect(snapshot.every((row) => row.recordedById === leaderId)).toBe(true);

      // Flip one member, add another, leave the third alone.
      const flipped = await api(admin).put(url, { present: [otherId, leaderId] });
      expect(flipped.body).toEqual({ success: true, present: 3, absent: 0 });
      const rows = await prisma.attendance.findMany({ where: { serviceId: service.id } });
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.userId === memberId)).toMatchObject({
        present: true,
        recordedById: leaderId,
      });
    });

    it('rejects unknown ids and contradictory marks without writing anything', async () => {
      const service = await newService('2026-09-06');
      const url = `/api/services/${service.id}/attendance`;
      const unknown = await api(leader).put(url, {
        present: [memberId],
        absent: ['cnobodynobodynobody00000'],
      });
      expect(unknown.status).toBe(400);
      expect(unknown.body.details).toEqual({ absent: ['Every id must name an existing member'] });

      const both = await api(leader).put(url, { present: [memberId], absent: [memberId] });
      expect(both.status).toBe(400);
      expect(both.body.details.absent).toEqual(['A member cannot be both present and absent']);

      const malformed = await api(leader).put(url, { present: ['not-an-id'] });
      expect(malformed.status).toBe(400);
      expect(await prisma.attendance.count()).toBe(0);
    });
  });

  describe('member attendance summaries', () => {
    async function seedHistory() {
      const recent = await newService(daysAgo(7));
      const older = await newService(daysAgo(100));
      const missed = await newService(daysAgo(14));
      const study = await newService(daysAgo(7), 'bible_study');
      const outside = await newService(daysAgo(500));
      for (const s of [recent, older, study, outside])
        await api(leader).put(`/api/services/${s.id}/attendance`, { present: [memberId] });
      await api(leader).put(`/api/services/${missed.id}/attendance`, { absent: [memberId] });
      return { recent, older, study };
    }

    it('counts the Sunday services in the window and the ones attended', async () => {
      const { recent, older } = await seedHistory();
      const res = await api(leader).get(`/api/member-details/${memberId}/attendance`);
      expect(res.status).toBe(200);
      expect(res.body.attendance).toMatchObject({
        months: 12,
        to: daysAgo(0),
        types: ['sunday_service'],
        serviceCount: 3,
        attendedCount: 2,
      });
      expect(res.body.attendance.attended.map((s: { id: string }) => s.id)).toEqual([
        recent.id,
        older.id,
      ]);
    });

    it('takes the window and the service types from the query', async () => {
      await seedHistory();
      const short = await api(leader).get(`/api/member-details/${memberId}/attendance?months=1`);
      expect(short.body.attendance).toMatchObject({ serviceCount: 2, attendedCount: 1 });

      const both = await api(leader).get(
        `/api/member-details/${memberId}/attendance?types=bible_study,sunday_service`,
      );
      expect(both.body.attendance).toMatchObject({
        types: ['sunday_service', 'bible_study'],
        serviceCount: 4,
        attendedCount: 3,
      });
      const repeated = await api(leader).get(
        `/api/member-details/${memberId}/attendance?types=bible_study&types=sunday_service&months=60`,
      );
      expect(repeated.body.attendance).toMatchObject({ serviceCount: 5, attendedCount: 4 });

      for (const query of ['?months=0', '?months=61', '?types=youth', '?types='])
        expect(
          (await api(leader).get(`/api/member-details/${memberId}/attendance${query}`)).status,
          query,
        ).toBe(400);
      expect(
        (await api(leader).get('/api/member-details/cnobodynobodynobody00000/attendance')).status,
      ).toBe(404);
    });

    it("gives a member their own summary and nobody else's", async () => {
      await seedHistory();
      const own = await api(member).get('/api/member-details/me/attendance');
      expect(own.status).toBe(200);
      expect(own.body.attendance).toMatchObject({ serviceCount: 3, attendedCount: 2 });
      expect((await api(member).get(`/api/member-details/${otherId}`)).status).toBe(403);

      // Staff asking for "me" get their own (empty) summary.
      const staff = await api(leader).get('/api/member-details/me/attendance');
      expect(staff.body.attendance).toMatchObject({ serviceCount: 3, attendedCount: 0 });
      expect((await request(app).get('/api/member-details/me/attendance')).status).toBe(401);
    });
  });

  it('subtracts calendar months, clamping to the end of a shorter month', () => {
    expect(monthsBefore(dbDate('2026-10-05'), 12).toISOString().slice(0, 10)).toBe('2025-10-05');
    expect(monthsBefore(dbDate('2026-03-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(monthsBefore(dbDate('2026-01-15'), 2).toISOString().slice(0, 10)).toBe('2025-11-15');
  });
});
