import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Opts in to the auth rate limits with a max of 3 (login: 3 per IP and email, 15 per IP;
// register: 3 per IP). The env is read when the app modules load, so the app is imported after
// stubbing (vitest gives every test file fresh modules). The .js suffix is what NodeNext requires
// for import(); vite resolves it to the .ts source.
//
// supertest connects over loopback, which the default TRUST_PROXY trusts, so X-Forwarded-For
// sets req.ip. Every test uses its own forwarded addresses, so the buckets do not overlap.
let app: Express;

const login = (ip: string, email: string) =>
  request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password: 'wrong-password-1' });

const register = (ip: string, email: string) =>
  request(app)
    .post('/api/auth/register')
    .set('X-Forwarded-For', ip)
    .send({ email, password: 'long-enough-pass1', name: 'Limited' });

describe('auth rate limits (RATE_LIMIT_AUTH_MAX=3)', () => {
  beforeAll(async () => {
    vi.stubEnv('RATE_LIMIT_AUTH_MAX', '3');
    const { createApp } = await import('../src/app.js');
    app = createApp();
  });

  it('trusts X-Forwarded-For from loopback by default', async () => {
    const { env, trustProxy } = await import('../src/config/env.js');
    expect(env.TRUST_PROXY).toBe('loopback, uniquelocal');
    expect(trustProxy).toBe('loopback, uniquelocal');
    expect(app.get('trust proxy')).toBe('loopback, uniquelocal');
  });

  it('answers 429 RATE_LIMITED after 3 logins for one IP and email, with both policies in the headers', async () => {
    const email = 'ghost@rate-limit.test.local';
    const first = await login('203.0.113.1', email);
    expect(first.status).toBe(401);
    expect(first.headers['ratelimit-policy']).toMatch(/"15-in-15min"; q=15; w=900;/);
    expect(first.headers['ratelimit-policy']).toMatch(/"3-in-15min"; q=3; w=900;/);
    expect(first.headers.ratelimit).toMatch(/"15-in-15min"; r=14;/);
    expect(first.headers.ratelimit).toMatch(/"3-in-15min"; r=2;/);
    expect((await login('203.0.113.1', email)).status).toBe(401);
    // The email is lower-cased like the login lookup, so this is the same account.
    expect((await login('203.0.113.1', 'GHOST@Rate-Limit.test.local')).status).toBe(401);

    const limited = await login('203.0.113.1', email);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: expect.any(String), code: 'RATE_LIMITED' });
  });

  it('keeps separate login buckets for different forwarded IPs (same email)', async () => {
    const email = 'shared@rate-limit.test.local';
    for (let i = 0; i < 3; i++) expect((await login('203.0.113.7', email)).status).toBe(401);
    expect((await login('203.0.113.7', email)).status).toBe(429);
    expect((await login('203.0.113.8', email)).status).toBe(401);
  });

  it('keeps separate login buckets for different emails (same forwarded IP)', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < 3; i++) {
      expect((await login(ip, 'first@rate-limit.test.local')).status).toBe(401);
    }
    expect((await login(ip, 'first@rate-limit.test.local')).status).toBe(429);
    expect((await login(ip, 'second@rate-limit.test.local')).status).toBe(401);
  });

  it('caps logins per IP at five times the limit, across emails', async () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < 15; i++) {
      expect((await login(ip, `spray-${i}@rate-limit.test.local`)).status).toBe(401);
    }
    const limited = await login(ip, 'spray-new@rate-limit.test.local');
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect((await login('203.0.113.11', 'spray-new@rate-limit.test.local')).status).toBe(401);
  });

  it('limits registration per IP regardless of the email, apart from logins', async () => {
    const ip = '203.0.113.20';
    // Logins from the same IP do not use up the registration bucket.
    expect((await login(ip, 'reg-0@rate-limit.test.local')).status).toBe(401);
    for (let i = 1; i <= 3; i++) {
      expect((await register(ip, `reg-${i}@rate-limit.test.local`)).status).toBe(201);
    }
    const limited = await register(ip, 'reg-4@rate-limit.test.local');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: expect.any(String), code: 'RATE_LIMITED' });
    expect((await register('203.0.113.21', 'reg-4@rate-limit.test.local')).status).toBe(201);
  });

  it('does not limit other routes', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});
