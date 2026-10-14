'use client';

import RequireStaff from '@/components/auth/RequireStaff';
import FamiliesPage from '@/components/families/FamiliesPage';

export default function FamiliesRoute() {
  return (
    <RequireStaff>
      <FamiliesPage />
    </RequireStaff>
  );
}
