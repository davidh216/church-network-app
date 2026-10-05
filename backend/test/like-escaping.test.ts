import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { escapeLike } from '../src/lib/like';
import { app, bearer, createUser, login, resetDatabase } from './helpers';

// Prisma passes contains/startsWith (and case-insensitive equals) values to PostgreSQL as ILIKE
// patterns without escaping, so `%`, `_` and `\` in user input must be escaped to match literally.
//
// Fixture: Ann_Lee and AnnXLee (an unescaped `_` matches both), 50% Club (a literal `%`) and
// Back\slash Bea (a literal backslash), plus the admin who searches and a leader.

const email = (name: string) => `${name}@like.test.local`;
let adminToken: string;
let memberToken: string;

beforeAll(async () => {
  await resetDatabase();
  await createUser({ email: email('admin'), role: 'admin', name: 'Escape Admin' });
  await createUser({ email: email('leader'), role: 'leader', name: 'Lena Leader' });
  await createUser({ email: email('underscore'), role: 'member', name: 'Ann_Lee' });
  await createUser({ email: email('x'), role: 'member', name: 'AnnXLee' });
  await createUser({ email: email('percent'), role: 'member', name: '50% Club' });
  await createUser({ email: email('backslash'), role: 'member', name: 'Back\\slash Bea' });
  adminToken = await login(email('admin'));
  memberToken = await login(email('underscore'));
});

const names = (res: request.Response) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body.users as { name: string }[]).map((u) => u.name).sort();
};
const list = (q: string, token = adminToken) =>
  request(app)
    .get(`/api/users?q=${encodeURIComponent(q)}`)
    .set(bearer(token));
const search = (field: string, operator: string, value: string) =>
  request(app)
    .post('/api/users/search')
    .set(bearer(adminToken))
    .send({ conditions: [{ field, operator, value }], logic: 'AND' });

describe('escapeLike', () => {
  it('escapes the LIKE wildcards and the escape character', () => {
    expect(escapeLike('a\\b%c_d')).toBe('a\\\\b\\%c\\_d');
    expect(escapeLike('plain text')).toBe('plain text');
  });
});

describe('GET /api/users q matches literally', () => {
  it('as staff', async () => {
    expect(names(await list('_'))).toEqual(['Ann_Lee']);
    expect(names(await list('ann_lee'))).toEqual(['Ann_Lee']);
    expect(names(await list('%'))).toEqual(['50% Club']);
    expect(names(await list('%%'))).toEqual([]);
    expect(names(await list('Ann%Lee'))).toEqual([]);
    expect(names(await list('\\'))).toEqual(['Back\\slash Bea']);
  });

  it('as a member', async () => {
    expect(names(await list('%', memberToken))).toEqual(['50% Club']);
    expect(names(await list('a%e', memberToken))).toEqual([]);
    expect(names(await list('ann_', memberToken))).toEqual(['Ann_Lee']);
  });

  it('role is compared literally', async () => {
    const res = await request(app).get('/api/users?role=lead_r').set(bearer(adminToken));
    expect(names(res)).toEqual([]);
    expect(names(await request(app).get('/api/users?role=LEADER').set(bearer(adminToken)))).toEqual(
      ['Lena Leader'],
    );
  });
});

describe('POST /api/users/search text operators match literally', () => {
  it.each([
    ['contains', '_', ['Ann_Lee']],
    ['contains', '%', ['50% Club']],
    ['contains', '\\s', ['Back\\slash Bea']],
    ['contains', 'n%l', []],
    ['startsWith', 'ann_', ['Ann_Lee']],
    ['startsWith', '_', []],
    ['startsWith', '%', []],
    ['equals', 'ann_lee', ['Ann_Lee']],
    ['equals', 'annxle_', []],
    ['equals', '50%', []],
  ])('name %s %j', async (operator, value, expected) => {
    expect(names(await search('name', operator, value))).toEqual(expected);
  });

  it('roles includes is compared literally', async () => {
    expect(names(await search('roles', 'includes', 'lead_r'))).toEqual([]);
    expect(names(await search('roles', 'includes', 'Leader'))).toEqual(['Lena Leader']);
  });
});

describe('GET /api/media search and tag match literally', () => {
  beforeAll(async () => {
    for (const [title, tags] of [
      ['100% Grace', ['Worship']],
      ['Plain sermon', ['teaching']],
    ] as const) {
      const res = await request(app)
        .post('/api/media')
        .set(bearer(adminToken))
        .send({
          title,
          type: 'YOUTUBE_VIDEO',
          url: `https://youtu.be/${title === 'Plain sermon' ? 'aaaaaaaaaaa' : 'bbbbbbbbbbb'}`,
          tags,
        });
      expect(res.status).toBe(201);
    }
  });

  const titles = async (query: string) => {
    const res = await request(app).get(`/api/media?${query}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    return (res.body.media as { title: string }[]).map((m) => m.title).sort();
  };

  it('treats % and _ in search and tag as literal characters', async () => {
    expect(await titles('search=%25')).toEqual(['100% Grace']);
    expect(await titles('search=_')).toEqual([]);
    expect(await titles('search=0%25%20G')).toEqual(['100% Grace']);
    expect(await titles('search=%25%25')).toEqual([]);
    expect(await titles('tag=_')).toEqual([]);
    expect(await titles('tag=%25')).toEqual([]);
    expect(await titles('tag=teach_ng')).toEqual([]);
    expect(await titles('tag=teaching')).toEqual(['Plain sermon']);
  });
});
