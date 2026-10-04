import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { app, bearer, createUser, login, resetDatabase } from './helpers';
import { HttpError } from '../src/lib/http-error';
import { loggerOptions } from '../src/lib/logger';
import { requestLogger } from '../src/lib/request-logger';
import { errorHandler } from '../src/middleware/error-handler';
import { notFound } from '../src/middleware/not-found';

const known = (code: string) => new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, { code, clientVersion: 'test' });

// A minimal app whose only route throws the given error, wired like createApp().
function throwing(error: unknown) {
  const mini = express();
  mini.use(requestLogger);
  mini.get('/boom', () => {
    throw error;
  });
  mini.use(notFound);
  mini.use(errorHandler);
  return mini;
}

describe('error handler', () => {
  it.each([
    ['HttpError', new HttpError(403, 'Nope', 'FORBIDDEN'), 403, { error: 'Nope', code: 'FORBIDDEN' }],
    ['P2025 (record not found)', known('P2025'), 404, { error: 'Not found' }],
    ['P2002 (unique conflict)', known('P2002'), 409, { error: 'Already exists' }],
    ['P2003 (foreign key)', known('P2003'), 400, { error: 'Referenced record does not exist' }],
    ['JsonWebTokenError', new jwt.JsonWebTokenError('jwt malformed'), 401, { error: 'Invalid token' }],
    ['TokenExpiredError', new jwt.TokenExpiredError('jwt expired', new Date()), 401, { error: 'Invalid token' }],
  ])('maps %s', async (_name, error, status, body) => {
    const res = await request(throwing(error)).get('/boom');
    expect(res.status).toBe(status);
    expect(res.body).toEqual(body);
  });

  it('maps a ZodError to 400 VALIDATION with field details', async () => {
    const result = z.object({ age: z.number() }).safeParse({ age: 'x' });
    const res = await request(throwing(result.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.details.age).toHaveLength(1);
  });

  it('answers anything else with 500 and the request id, never the error message', async () => {
    const res = await request(throwing(new Error('secret internals'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(res.body)).not.toContain('secret internals');
  });

  it('answers an unknown Prisma error code with 500', async () => {
    expect((await request(throwing(known('P1001'))).get('/boom')).status).toBe(500);
  });

  it('maps a missing record in the real app to 404', async () => {
    await resetDatabase();
    await createUser({ email: 'errors-admin@test.local', role: 'admin' });
    const token = await login('errors-admin@test.local');
    const res = await request(app).get('/api/analytics/members/cjld2cjxh0000qzrmn831i7rn/engagement').set(bearer(token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    const media = await request(app).get('/api/media/cjld2cjxh0000qzrmn831i7rn').set(bearer(token));
    expect(media.status).toBe(404);
    expect(media.body.error).toBe('Media not found');
  });

  it('every response carries an X-Request-Id', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('health', () => {
  it('reports status, version and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
    expect(res.body.version).toBe('1.0.0');
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('logger', () => {
  it('redacts authorization, cookie and password values', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const log = pino({ ...loggerOptions, level: 'info', transport: undefined }, sink);
    log.info({
      req: { headers: { authorization: 'Bearer SECRET-TOKEN', cookie: 'embrace_session=SECRET-COOKIE' } },
      password: 'SECRET-PASSWORD',
      body: { password: 'NESTED-SECRET' },
    });
    const output = lines.join('');
    expect(output).toContain('[REDACTED]');
    for (const secret of ['SECRET-TOKEN', 'SECRET-COOKIE', 'SECRET-PASSWORD', 'NESTED-SECRET']) {
      expect(output).not.toContain(secret);
    }
  });
});
