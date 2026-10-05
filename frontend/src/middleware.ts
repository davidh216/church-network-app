import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isPublicPath } from './lib/auth/paths';

/**
 * Sends visitors without a session cookie to /login, and signed-in visitors away
 * from /login. The cookie's presence is only a UX hint: the API is the authority
 * and the AuthProvider handles a cookie the API rejects.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isBypassed(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (isPublicPath(pathname)) {
    if (pathname === '/login' && hasSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

/** API proxy, Next.js internals and static files (anything with a file extension). */
function isBypassed(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    /\.[^/]+$/.test(pathname)
  );
}

export const config = {
  // Keep in step with isBypassed; the function re-checks so it is correct on its own.
  matcher: ['/((?!api/|_next/|.*\\.[^/]+$).*)'],
};
