// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from './middleware';

function run(path: string, withCookie: boolean) {
  const headers = withCookie ? { cookie: 'embrace_session=jwt-value' } : undefined;
  return middleware(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  if (!location) return null;
  const url = new URL(location);
  return url.pathname + url.search;
}

describe('middleware', () => {
  it('redirects a request without the session cookie to /login with next', () => {
    expect(redirectTarget(run('/', false))).toBe('/login?next=%2F');
    expect(redirectTarget(run('/members?page=2', false))).toBe('/login?next=%2Fmembers%3Fpage%3D2');
  });

  it('lets a request with the session cookie through', () => {
    expect(redirectTarget(run('/', true))).toBeNull();
    expect(redirectTarget(run('/members', true))).toBeNull();
  });

  it('sends a signed-in visitor from /login to /', () => {
    expect(redirectTarget(run('/login', true))).toBe('/');
    expect(redirectTarget(run('/login?next=%2Fmembers', true))).toBe('/');
  });

  it('serves /login and /register without a cookie, and /register with one', () => {
    expect(redirectTarget(run('/login', false))).toBeNull();
    expect(redirectTarget(run('/register', false))).toBeNull();
    expect(redirectTarget(run('/register', true))).toBeNull();
  });

  it.each(['/api/auth/me', '/api', '/_next/static/chunks/main.js', '/favicon.ico', '/next.svg'])(
    'does not redirect %s',
    (path) => {
      expect(redirectTarget(run(path, false))).toBeNull();
    },
  );

  it('has a matcher that skips the API, Next.js internals and files', () => {
    const [pattern] = config.matcher;
    const matches = (p: string) => new RegExp(`^${pattern}$`).test(p);
    expect(matches('/')).toBe(true);
    expect(matches('/members')).toBe(true);
    expect(matches('/login')).toBe(true);
    expect(matches('/api/auth/me')).toBe(false);
    expect(matches('/_next/static/x.js')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
  });
});
