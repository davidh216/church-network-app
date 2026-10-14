'use client';

import RequireAdmin from '@/components/auth/RequireAdmin';
import AuditLogPage from '@/components/audit/AuditLogPage';

export default function AuditRoute() {
  return (
    <RequireAdmin>
      <AuditLogPage />
    </RequireAdmin>
  );
}
