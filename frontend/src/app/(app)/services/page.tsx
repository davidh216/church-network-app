'use client';

import RequireStaff from '@/components/auth/RequireStaff';
import ServicesPage from '@/components/services/ServicesPage';

export default function ServicesRoute() {
  return (
    <RequireStaff>
      <ServicesPage />
    </RequireStaff>
  );
}
