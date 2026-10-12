import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// /health must answer 503 when the database cannot be reached, not hang (PHASE4_SPECS.md U5: the
// pg adapter's connectionTimeoutMillis, by default Prisma 6's 5 s connect_timeout; see
// pgConfigFromUrl). Each test loads the app afresh with its own
// Prisma client pointing at an unreachable database; the shared test client is put back after.
const globalForPrisma = globalThis as { prisma?: unknown };
const sharedClient = globalForPrisma.prisma;

// Accepts TCP connections and never answers: a database host that has stopped responding, the
// case that waits for the connection timeout rather than failing at once.
let silent: Server;
const sockets = new Set<Socket>();

beforeAll(async () => {
  silent = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((done) => silent.listen(0, '127.0.0.1', done));
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise((done) => silent.close(done));
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalForPrisma.prisma = sharedClient;
});

async function healthAgainst(databaseUrl: string) {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', databaseUrl);
  delete globalForPrisma.prisma;
  const { createApp } = await import('../src/app.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const started = Date.now();
  try {
    const res = await request(createApp()).get('/health');
    return { res, elapsed: Date.now() - started };
  } finally {
    await prisma.$disconnect();
  }
}

async function closedPort() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

describe('health while the database is down', () => {
  it('answers 503 at once when the connection is refused', async () => {
    const port = await closedPort();
    const { res, elapsed } = await healthAgainst(
      `postgresql://church:church@127.0.0.1:${port}/church_test?schema=public`,
    );
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'DEGRADED', message: 'Database unavailable' });
    expect(elapsed).toBeLessThan(2_000);
  });

  it('answers 503 within the 5 s connection timeout when the server does not respond', async () => {
    const { port } = silent.address() as AddressInfo;
    const { res, elapsed } = await healthAgainst(
      `postgresql://church:church@127.0.0.1:${port}/church_test?schema=public`,
    );
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('DEGRADED');
    expect(elapsed).toBeGreaterThanOrEqual(4_500);
    expect(elapsed).toBeLessThan(8_000);
  }, 20_000);

  it('answers 503 within the connect_timeout and pool_timeout given in the URL', async () => {
    const { port } = silent.address() as AddressInfo;
    const { res, elapsed } = await healthAgainst(
      `postgresql://church:church@127.0.0.1:${port}/church_test?schema=public&connect_timeout=2&pool_timeout=1`,
    );
    expect(res.status).toBe(503);
    expect(elapsed).toBeGreaterThanOrEqual(1_500);
    expect(elapsed).toBeLessThan(5_000);
  }, 15_000);
});
