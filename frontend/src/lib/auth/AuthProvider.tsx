'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import * as authApi from '@/lib/api/auth';
import { isApiError, UNAUTHENTICATED_EVENT } from '@/lib/api/client';
import { hasRole, isStaff, type User } from '@/types/domain';
import { isPublicPath } from './paths';

/**
 * `anonymous`: the API said there is no (valid) session. `error`: the API could not be asked
 * (network error, 5xx), so whether there is a session is unknown; `refresh()` asks again.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the signed-in user. The session itself is the httpOnly `embrace_session`
 * cookie; this only mirrors what `/api/auth/me` says about it.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  // Set while a 401 is being handled, so the logout call it makes cannot re-enter.
  const handling401 = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setUser(await authApi.me());
      setStatus('authenticated');
    } catch (err) {
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        setUser(null);
        setStatus('anonymous');
      } else {
        // Unreachable or failing API: not evidence of a signed-out user, so keep any user
        // already loaded and let the page offer a retry.
        setStatus('error');
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await authApi.login(email, password);
    setUser(signedIn);
    setStatus('authenticated');
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Drop the user locally either way; the cookie expires on its own.
    }
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthenticated = () => {
      setUser(null);
      setStatus('anonymous');
      const { pathname, search } = window.location;
      if (handling401.current || isPublicPath(pathname)) return;
      handling401.current = true;
      // A stale or invalid cookie would make the middleware bounce /login back to /,
      // so ask the API to clear it before going to the sign-in page.
      void authApi
        .logout()
        .catch(() => undefined)
        .finally(() => {
          handling401.current = false;
          router.replace(`/login?next=${encodeURIComponent(pathname + search)}`);
        });
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, [router]);

  const value = useMemo(
    () => ({ user, status, login, logout, refresh }),
    [user, status, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** True when the signed-in user has any of the given role names. */
export function useHasRole(...names: string[]): boolean {
  return hasRole(useAuth().user, ...names);
}

/** True for admins and leaders, the roles the API lets manage members and media. */
export function useIsStaff(): boolean {
  return isStaff(useAuth().user);
}
