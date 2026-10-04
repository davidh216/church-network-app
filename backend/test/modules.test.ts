import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { prisma } from '../src/lib/prisma';

// Happy paths of the routes moved into src/modules/* (analytics, member-details, saved searches, media).
let staff: string;
let member: string;
let memberId: string;

describe('modules', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createUser({ email: 'modules-leader@modules.test.local', role: 'leader' });
    memberId = (await createUser({ email: 'modules-member@modules.test.local', role: 'member' })).id;
    staff = await login('modules-leader@modules.test.local');
    member = await login('modules-member@modules.test.local');
  });

  describe('member-details', () => {
    it('records and lists interactions, milestones and notes with defaults applied', async () => {
      const interaction = await request(app)
        .post(`/api/member-details/${memberId}/interactions`)
        .set(bearer(staff))
        .send({ interactionType: 'call_made', channel: 'phone', subject: 'Check-in', category: 'follow_up' });
      expect(interaction.status).toBe(200);
      expect(interaction.body.interaction).toMatchObject({ priority: 'normal', responseRequired: false, status: 'completed' });

      const milestone = await request(app)
        .post(`/api/member-details/${memberId}/milestones`)
        .set(bearer(staff))
        .send({ milestoneType: 'baptism', title: 'Baptised', achievedDate: '2026-05-01' });
      expect(milestone.status).toBe(200);
      expect(milestone.body.milestone).toMatchObject({ category: 'general', impact: 'medium' });
      expect(milestone.body.milestone.achievedDate).toBe('2026-05-01T00:00:00.000Z');

      const note = await request(app)
        .post(`/api/member-details/${memberId}/notes`)
        .set(bearer(staff))
        .send({ content: 'Asked for prayer', noteType: 'prayer_request', followUpDate: '2026-06-01' });
      expect(note.status).toBe(200);
      expect(note.body.note).toMatchObject({ noteType: 'prayer_request', isPrivate: false, isFollowUp: false });

      const interactions = await request(app).get(`/api/member-details/${memberId}/interactions?category=follow_up`).set(bearer(staff));
      expect(interactions.body.interactions).toHaveLength(1);
      const none = await request(app).get(`/api/member-details/${memberId}/interactions?category=welcome`).set(bearer(staff));
      expect(none.body.interactions).toHaveLength(0);
      const milestones = await request(app).get(`/api/member-details/${memberId}/milestones`).set(bearer(staff));
      expect(milestones.body.milestones).toHaveLength(1);
      const notes = await request(app).get(`/api/member-details/${memberId}/notes?noteType=prayer_request&limit=5`).set(bearer(staff));
      expect(notes.body.notes).toHaveLength(1);
      const timeline = await request(app).get(`/api/member-details/${memberId}/timeline`).set(bearer(staff));
      expect(timeline.status).toBe(200);
      expect(timeline.body.activities).toEqual([]);

      const profile = await request(app).get(`/api/member-details/${memberId}`).set(bearer(staff));
      expect(profile.status).toBe(200);
      expect(profile.body.user.interactions).toHaveLength(1);
      expect(profile.body.user.familyMembers).toEqual([]);
      expect(profile.body.user.password).toBeUndefined();
    });

    it('returns 404 for an unknown member and 400 for a note on one', async () => {
      const unknown = 'cjld2cjxh0000qzrmn831i7rn';
      expect((await request(app).get(`/api/member-details/${unknown}`).set(bearer(staff))).status).toBe(404);
      const note = await request(app).post(`/api/member-details/${unknown}/notes`).set(bearer(staff)).send({ content: 'x' });
      expect(note.status).toBe(400);
    });
  });

  describe('analytics', () => {
    it('records an activity and an interaction, then reports engagement, trends and totals', async () => {
      const activity = await request(app)
        .post(`/api/analytics/members/${memberId}/activities`)
        .set(bearer(staff))
        .send({ activityType: 'volunteer', points: 5, metadata: { hours: 3 } });
      expect(activity.status).toBe(200);
      const stored = await prisma.memberEngagement.findUniqueOrThrow({ where: { userId: memberId } });
      expect(stored.volunteerHours).toBe(3);
      expect(stored.riskLevel).toMatch(/^(low|medium|high)$/);

      const interaction = await request(app)
        .post(`/api/analytics/members/${memberId}/interactions`)
        .set(bearer(staff))
        .send({ interactionType: 'email_opened', channel: 'email' });
      expect(interaction.status).toBe(200);

      const engagement = await request(app).get(`/api/analytics/members/${memberId}/engagement`).set(bearer(staff));
      expect(engagement.status).toBe(200);
      expect(engagement.body.engagement.communicationScore).toBe(100);

      const trends = await request(app).get(`/api/analytics/members/${memberId}/trends?months=3`).set(bearer(staff));
      expect(trends.status).toBe(200);
      expect(trends.body.trends).toEqual([expect.objectContaining({ activities: 1, points: 5 })]);

      expect((await request(app).post(`/api/analytics/members/${memberId}/engagement/refresh`).set(bearer(staff))).status).toBe(200);
      const all = await request(app).post('/api/analytics/members/engagement/refresh-all').set(bearer(staff));
      expect(all.status).toBe(200);
      expect(all.body.message).toBe('Updated engagement scores for 2 out of 2 members');

      const totals = await request(app).get('/api/analytics/members').set(bearer(staff));
      expect(totals.status).toBe(200);
      expect(totals.body.analytics.totalMembers).toBe(2);
      expect(totals.body.analytics.membershipStageDistribution).toEqual(expect.any(Object));
    });
  });

  describe('saved searches', () => {
    it('creates, lists, uses and deletes a search; others cannot delete it', async () => {
      const created = await request(app)
        .post('/api/users/saved-searches')
        .set(bearer(member))
        .send({ name: 'Mine', query: { conditions: [] }, isPublic: true });
      expect(created.status).toBe(201);
      expect(created.body.search).toMatchObject({ name: 'Mine', query: { conditions: [] }, isPublic: true });
      const id = created.body.search.id as string;

      const list = await request(app).get('/api/users/saved-searches').set(bearer(staff));
      expect(list.body.searches.map((s: { id: string }) => s.id)).toContain(id);

      expect((await request(app).post(`/api/users/saved-searches/${id}/use`).set(bearer(staff))).status).toBe(200);
      expect((await prisma.savedSearch.findUniqueOrThrow({ where: { id } })).usageCount).toBe(1);

      expect((await request(app).delete(`/api/users/saved-searches/${id}`).set(bearer(staff))).status).toBe(403);
      expect((await request(app).delete(`/api/users/saved-searches/${id}`).set(bearer(member))).status).toBe(200);
      expect((await request(app).delete(`/api/users/saved-searches/${id}`).set(bearer(member))).status).toBe(404);
    });
  });

  describe('media and roles', () => {
    it('staff add a video that members can then fetch by id', async () => {
      const created = await request(app)
        .post('/api/media')
        .set(bearer(staff))
        .send({ title: 'Sermon', type: 'YOUTUBE_VIDEO', url: 'https://www.youtube.com/watch?v=abc123' });
      expect(created.status).toBe(201);
      expect(created.body.media.tags).toBe('[]');
      const fetched = await request(app).get(`/api/media/${created.body.media.id}`).set(bearer(member));
      expect(fetched.status).toBe(200);
      expect(fetched.body.media.uploadedBy.name).toBe('modules-leader');
    });

    it('lists roles for any signed-in user', async () => {
      const res = await request(app).get('/api/roles').set(bearer(member));
      expect(res.body.roles.map((r: { name: string }) => r.name)).toEqual(['admin', 'leader', 'member']);
    });

    it('exports JSON rows for staff', async () => {
      const res = await request(app).get(`/api/users/export?format=json&members=${memberId}`).set(bearer(staff));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].Email).toBe('modules-member@modules.test.local');
    });
  });
});
