import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

// GET /api/member-details/:id/timeline: the computed feed (Phase 3 spec 1.6).
let admin: string;
let author: string;
let otherLeader: string;
let authorId: string;
let memberId: string;

const day = (d: string) => new Date(`${d}T12:00:00.000Z`);

interface Item {
  kind: string;
  id: string;
  date: string;
  dateOnly: boolean;
  title: string;
  summary: string | null;
}

async function timeline(token: string, query = '') {
  const res = await request(app)
    .get(`/api/member-details/${memberId}/timeline${query}`)
    .set(bearer(token));
  expect(res.status).toBe(200);
  return res.body as { items: Item[]; total: number; page: number; pageSize: number };
}

describe('member timeline', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'timeline-admin@timeline.test.local', role: 'admin' });
    authorId = (await createUser({ email: 'timeline-author@timeline.test.local', role: 'leader' }))
      .id;
    await createUser({ email: 'timeline-other@timeline.test.local', role: 'leader' });
    memberId = (await createUser({ email: 'timeline-member@timeline.test.local', role: 'member' }))
      .id;
    admin = await login('timeline-admin@timeline.test.local');
    author = await login('timeline-author@timeline.test.local');
    otherLeader = await login('timeline-other@timeline.test.local');

    await prisma.memberInteraction.create({
      data: {
        userId: memberId,
        interactionType: 'call_made',
        channel: 'phone',
        content: 'Talked about small groups',
        createdAt: day('2026-03-01'),
      },
    });
    await prisma.memberMilestone.create({
      data: {
        userId: memberId,
        milestoneType: 'baptism',
        title: 'Baptised',
        description: 'Easter service',
        achievedDate: day('2026-04-05'),
      },
    });
    await prisma.memberNote.create({
      data: {
        userId: memberId,
        authorId,
        content: 'Public note',
        noteType: 'general',
        createdAt: day('2026-02-01'),
      },
    });
    await prisma.memberNote.create({
      data: {
        userId: memberId,
        authorId,
        title: 'Confidential',
        content: 'Private note',
        noteType: 'pastoral_care',
        isPrivate: true,
        createdAt: day('2026-05-01'),
      },
    });
    const [jan4, jan11] = await Promise.all(
      ['2026-01-04', '2026-01-11'].map((date) =>
        prisma.service.create({ data: { date: day(date), type: 'sunday_service' } }),
      ),
    );
    await prisma.attendance.createMany({
      data: [
        { userId: memberId, serviceId: jan4!.id },
        { userId: memberId, serviceId: jan11!.id, present: false },
      ],
    });
  });

  it('merges every source newest first, leaving out absences', async () => {
    const body = await timeline(admin);
    expect(body).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(body.items.map((i) => [i.kind, i.date.slice(0, 10)])).toEqual([
      ['note', '2026-05-01'],
      ['milestone', '2026-04-05'],
      ['interaction', '2026-03-01'],
      ['note', '2026-02-01'],
      ['attendance', '2026-01-04'],
    ]);
    expect(body.items[0]).toMatchObject({ title: 'Confidential', summary: 'Private note' });
    expect(body.items[1]).toMatchObject({ title: 'Baptised', summary: 'Easter service' });
    expect(body.items[2]).toMatchObject({
      title: 'Call made',
      summary: 'Talked about small groups',
    });
    expect(body.items[3]).toMatchObject({ title: 'General', summary: 'Public note' });
    expect(body.items[4]).toMatchObject({ title: 'Attended sunday service', summary: null });
  });

  it('pages through the merged feed without gaps or repeats', async () => {
    const all = (await timeline(admin)).items.map((i) => i.id);
    const pages = [];
    for (const page of [1, 2, 3]) {
      const body = await timeline(admin, `?page=${page}&pageSize=2`);
      expect(body).toMatchObject({ total: 5, page, pageSize: 2 });
      pages.push(...body.items.map((i) => i.id));
    }
    expect(pages).toEqual(all);
    expect((await timeline(admin, '?page=4&pageSize=2')).items).toEqual([]);
  });

  it('shows a private note only to its author and to admins', async () => {
    const authorView = await timeline(author);
    expect(authorView.total).toBe(5);
    expect(authorView.items.some((i) => i.summary === 'Private note')).toBe(true);

    const otherView = await timeline(otherLeader);
    expect(otherView.total).toBe(4);
    expect(otherView.items.some((i) => i.summary === 'Private note')).toBe(false);
    expect(otherView.items.map((i) => i.kind)).toEqual([
      'milestone',
      'interaction',
      'note',
      'attendance',
    ]);
  });

  it('rejects paging outside the bounds', async () => {
    for (const query of ['?page=0', '?page=101', '?pageSize=0', '?pageSize=101']) {
      const res = await request(app)
        .get(`/api/member-details/${memberId}/timeline${query}`)
        .set(bearer(admin));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    }
  });
});

const UNKNOWN_ID = 'cjld2cjxh0000qzrmn831i7rn';

describe('member timeline: unknown member and calendar dates', () => {
  let otherId: string;

  beforeAll(async () => {
    otherId = (await createUser({ email: 'timeline-dates@timeline.test.local', role: 'member' }))
      .id;
    const midnight = new Date('2026-06-07T00:00:00.000Z');
    const service = await prisma.service.create({ data: { date: midnight, type: 'bible_study' } });
    await prisma.attendance.create({ data: { userId: otherId, serviceId: service.id } });
    await prisma.memberMilestone.createMany({
      data: [
        { userId: otherId, milestoneType: 'wedding', title: 'Wedding', achievedDate: midnight },
        {
          userId: otherId,
          milestoneType: 'other',
          title: 'Timed',
          achievedDate: new Date('2026-06-01T15:30:00.000Z'),
        },
      ],
    });
    await prisma.memberInteraction.create({
      data: {
        userId: otherId,
        interactionType: 'visit_logged',
        channel: 'in_person',
        createdAt: new Date('2026-06-02T00:00:00.000Z'),
      },
    });
  });

  it('answers 404 for a member that does not exist, like the profile route', async () => {
    for (const path of [UNKNOWN_ID, `${UNKNOWN_ID}/timeline`]) {
      const res = await request(app).get(`/api/member-details/${path}`).set(bearer(admin));
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    }
  });

  it('marks attendance and midnight milestones as date-only, timestamps as not', async () => {
    const res = await request(app)
      .get(`/api/member-details/${otherId}/timeline`)
      .set(bearer(admin));
    expect(res.status).toBe(200);
    const items = res.body.items as Item[];
    expect(items.map((i) => [i.kind, i.title, i.date, i.dateOnly])).toEqual([
      ['attendance', 'Attended bible study', '2026-06-07T00:00:00.000Z', true],
      ['milestone', 'Wedding', '2026-06-07T00:00:00.000Z', true],
      // An interaction logged exactly at UTC midnight is still a timestamp.
      ['interaction', 'Visit logged', '2026-06-02T00:00:00.000Z', false],
      ['milestone', 'Timed', '2026-06-01T15:30:00.000Z', false],
    ]);
  });

  it('derives lastAttended from the latest present attendance up to today', async () => {
    const lastAttended = async () => {
      const res = await request(app).get(`/api/member-details/${otherId}`).set(bearer(admin));
      expect(res.status).toBe(200);
      return res.body.user.lastAttended as string | null;
    };
    expect(await lastAttended()).toBe('2026-06-07T00:00:00.000Z');

    const dayFromToday = (offset: number) => {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
    };
    const [yesterday, todayService, tomorrow] = await Promise.all(
      [-1, 0, 1].map((offset) =>
        prisma.service.create({ data: { date: dayFromToday(offset), type: 'prayer_meeting' } }),
      ),
    );
    // A later absence and a future service do not count; the legacy column is ignored.
    await prisma.attendance.createMany({
      data: [
        { userId: otherId, serviceId: yesterday!.id },
        { userId: otherId, serviceId: todayService!.id, present: false },
        { userId: otherId, serviceId: tomorrow!.id },
      ],
    });
    await prisma.user.update({
      where: { id: otherId },
      data: { lastAttended: new Date('2020-01-01T00:00:00.000Z') },
    });
    expect(await lastAttended()).toBe(dayFromToday(-1).toISOString());

    await prisma.attendance.updateMany({
      where: { userId: otherId, serviceId: todayService!.id },
      data: { present: true },
    });
    expect(await lastAttended()).toBe(dayFromToday(0).toISOString());
  });
});
