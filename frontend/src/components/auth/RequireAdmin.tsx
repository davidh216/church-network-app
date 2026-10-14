'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { noticeHref } from '@/lib/notices';
import { hasRole } from '@/types/domain';

/**
 * Client-side guard for admin-only routes: anyone else is sent to the dashboard with a notice.
 * This is UX only; the API refuses the data either way.
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = hasRole(user, 'admin');

  useEffect(() => {
    if (user && !allowed) router.replace(noticeHref('admin-only'));
  }, [user, allowed, router]);

  return allowed ? <>{children}</> : null;
}
