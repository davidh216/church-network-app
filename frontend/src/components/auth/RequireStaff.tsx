'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { noticeHref } from '@/lib/notices';
import { isStaff } from '@/types/domain';

interface RequireStaffProps {
  children: React.ReactNode;
  /** Also let this user through (a member opening their own profile). */
  allowUserId?: string;
}

/**
 * Client-side guard for staff-only routes: anyone else is sent to the dashboard with a notice.
 * This is UX only; the API refuses the data either way.
 */
export default function RequireStaff({ children, allowUserId }: RequireStaffProps) {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = !!user && (isStaff(user) || (!!allowUserId && user.id === allowUserId));

  useEffect(() => {
    if (user && !allowed) router.replace(noticeHref('staff-only'));
  }, [user, allowed, router]);

  return allowed ? <>{children}</> : null;
}
