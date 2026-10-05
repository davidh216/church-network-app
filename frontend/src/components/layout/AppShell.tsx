'use client';

import Link from 'next/link';
import { useAuth, useIsStaff } from '@/lib/auth/AuthProvider';
import AppNav from './AppNav';
import PageSpinner from './PageSpinner';
import ServerUnavailable from './ServerUnavailable';

/**
 * The signed-in shell around every (app) route: header, navigation and sign-out. The middleware
 * sends visitors without a session cookie to /login; if the API rejects the cookie, the
 * AuthProvider routes there instead. Pages render only once the user is known.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status, logout, refresh } = useAuth();
  const staff = useIsStaff();

  if (status === 'error') return <ServerUnavailable onRetry={refresh} />;

  // A 401 makes the AuthProvider clear the cookie and route to /login; this covers the moment
  // before that redirect, and a 403 from /me.
  if (status === 'anonymous') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">
          You are signed out.{' '}
          <Link href="/login" className="text-blue-600 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageSpinner />
      </div>
    );
  }

  const roleNames = user.roles.length ? user.roles.map((r) => r.role.name) : ['member'];

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-blue-700 focus:shadow-lg focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <Link href="/" className="hover:opacity-80 transition-opacity">
                <span className="text-3xl font-bold text-gray-900">Embrace</span>
              </Link>
              <p className="text-gray-600">Welcome back, {user.name}!</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                <div className="flex flex-wrap justify-end gap-1 mt-1">
                  {roleNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
        <AppNav staff={staff} userId={user.id} />
      </header>
      {/* tabIndex -1 lets the skip link move focus here, not only scroll. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
