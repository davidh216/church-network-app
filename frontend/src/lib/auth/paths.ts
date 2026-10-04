/** Name of the httpOnly session cookie set by the API (shared contract 1.1). */
export const SESSION_COOKIE = 'embrace_session';

/** Pages that render without a session. */
const PUBLIC_PATHS = new Set(['/login', '/register']);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * The in-app path to return to after sign-in. Only same-origin absolute paths
 * are accepted ("/members?x=1"); anything else ("//evil.com", "https://...", "/\\evil")
 * falls back to "/" so `?next=` cannot be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (isPublicPath(next.split(/[?#]/)[0] ?? '')) return '/';
  return next;
}
