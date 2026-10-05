'use client';

import RequireStaff from '@/components/auth/RequireStaff';
import { useAuth, useIsStaff } from '@/lib/auth/AuthProvider';
import MemberProfile from './MemberProfile';
import OwnProfile from './OwnProfile';

/**
 * `/members/[id]`: staff see the full profile of anyone; a member may open only their own
 * profile, and anyone else's sends them to the dashboard with a notice.
 */
export default function MemberProfileRoute({ id }: { id: string }) {
  const { user } = useAuth();
  const staff = useIsStaff();
  return (
    <RequireStaff allowUserId={id}>
      {staff ? <MemberProfile memberId={id} /> : user ? <OwnProfile user={user} /> : null}
    </RequireStaff>
  );
}
