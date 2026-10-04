import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_MATCHES_EMAIL } from '@embrace/shared';
import { app, resetDatabase } from './helpers';

// The API validates with the @embrace/shared schemas, so the web app's client-side checks
// (same package) report the same rules and messages.
describe('API validation comes from @embrace/shared', () => {
  beforeAll(resetDatabase);

  const register = (password: string, email = 'shared@example.org') =>
    request(app).post('/api/auth/register').send({ email, password, name: 'Shared' });

  it('enforces the shared minimum and maximum password length', async () => {
    const short = await register('x'.repeat(MIN_PASSWORD_LENGTH - 1));
    expect(short.status).toBe(400);
    expect(short.body.details.password).toEqual([
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ]);

    const long = await register('x'.repeat(MAX_PASSWORD_LENGTH + 1));
    expect(long.status).toBe(400);
    expect(long.body.details.password).toEqual([
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    ]);
  });

  it('reports the shared email-local-part message', async () => {
    const res = await register('sharedaccount', 'sharedaccount@example.org');
    expect(res.status).toBe(400);
    expect(res.body.details.password).toEqual([PASSWORD_MATCHES_EMAIL]);
  });
});
