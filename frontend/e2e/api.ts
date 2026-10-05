import { expect, request, type APIRequestContext } from '@playwright/test';
import { seededAdmin } from './admin';

// Same base URL as playwright.config.ts; the API is reached through the web app's /api rewrite.
const baseURL = `http://localhost:${process.env.E2E_WEB_PORT ?? 3000}`;

/** An API client signed in as `credentials` (the session cookie stays in the context). */
export async function signedInRequest(credentials: {
  email: string;
  password: string;
}): Promise<APIRequestContext | null> {
  const context = await request.newContext({ baseURL });
  const login = await context.post('/api/auth/login', { data: credentials });
  if (login.ok()) return context;
  await context.dispose();
  return null;
}

/** An API client signed in as the seeded admin. */
export async function adminRequest(): Promise<APIRequestContext> {
  const context = await signedInRequest(seededAdmin());
  if (!context) throw new Error('The seeded admin could not sign in');
  return context;
}

/**
 * The one member account the suite uses (no staff role). Every run reuses it, so church_dev does
 * not grow: it is created only when it cannot sign in, and an existing row that cannot (for
 * example deactivated, or with another password) is reactivated with the known password.
 */
export const E2E_MEMBER = {
  name: 'E2E Member',
  email: 'e2e-member@example.test',
  password: 'E2e-member-fixed-password',
};

export async function ensureE2eMember(admin: APIRequestContext): Promise<{ id: string }> {
  const signedIn = await signedInRequest(E2E_MEMBER);
  if (!signedIn) {
    const created = await admin.post('/api/users', { data: { ...E2E_MEMBER, isActive: true } });
    if (created.status() !== 409) {
      expect(created.status()).toBe(201);
      return ((await created.json()) as { user: { id: string } }).user;
    }
    // The account exists but cannot sign in: reset it rather than make another.
    const id = await memberId(admin);
    expect((await admin.put(`/api/users/${id}`, { data: { isActive: true } })).ok()).toBe(true);
    const reset = await admin.post(`/api/users/${id}/reset-password`, {
      data: { newPassword: E2E_MEMBER.password },
    });
    expect(reset.ok()).toBe(true);
    return { id };
  }
  await signedIn.dispose();
  return { id: await memberId(admin) };
}

async function memberId(admin: APIRequestContext): Promise<string> {
  const found = await admin.get('/api/users', { params: { q: E2E_MEMBER.email } });
  expect(found.ok()).toBe(true);
  const { users } = (await found.json()) as { users: { id: string; email?: string }[] };
  const user = users.find((u) => u.email === E2E_MEMBER.email);
  if (!user) throw new Error(`${E2E_MEMBER.email} exists but was not found`);
  return user.id;
}

/** Deletes the admin's saved searches whose name starts with `prefix` (leftovers included). */
export async function deleteSavedSearches(admin: APIRequestContext, prefix: string) {
  const list = await admin.get('/api/users/saved-searches');
  expect(list.ok()).toBe(true);
  const { searches } = (await list.json()) as { searches: { id: string; name: string }[] };
  for (const search of searches.filter((s) => s.name.startsWith(prefix))) {
    expect((await admin.delete(`/api/users/saved-searches/${search.id}`)).ok()).toBe(true);
  }
}

/** Adds one video when the library is empty, so the media page has cards to check. */
export async function ensureOneVideo(admin: APIRequestContext) {
  const list = await admin.get('/api/media', { params: { pageSize: 1 } });
  expect(list.ok()).toBe(true);
  if (((await list.json()) as { total: number }).total > 0) return;
  const created = await admin.post('/api/media', {
    data: {
      title: 'E2E sample video',
      type: 'YOUTUBE_VIDEO',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      tags: ['worship'],
    },
  });
  expect(created.status()).toBe(201);
}
