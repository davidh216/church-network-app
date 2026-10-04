import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Opts in to the auth rate limit with a max of 3. The env is read when the app modules load,
// so the app is imported after stubbing (vitest gives every test file fresh modules). The .js
// suffix is what NodeNext requires for import(); vite resolves it to the .ts source.
let app: Express;

describe('auth rate limit (RATE_LIMIT_AUTH_MAX=3)', () => {
  beforeAll(async () => {
    vi.stubEnv('RATE_LIMIT_AUTH_MAX', '3');
    const { createApp } = await import('../src/app.js');
    app = createApp();
  });

  it('answers 429 RATE_LIMITED after 3 attempts, counting login and register together', async () => {
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'wrong-password-1' });
    const first = await attempt();
    expect(first.status).toBe(401);
    expect(first.headers['ratelimit-policy']).toMatch(/^"3-in-15min"; q=3; w=900;/);
    expect(first.headers.ratelimit).toMatch(/r=2/);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);

    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: expect.any(String), code: 'RATE_LIMITED' });

    const register = await request(app)
      .post('/api/auth/register')
      .send({ email: 'limited@test.local', password: 'long-enough-pass1', name: 'Limited' });
    expect(register.status).toBe(429);
    expect(register.body.code).toBe('RATE_LIMITED');
  });

  it('does not limit other routes', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});
