'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { noticeMessage } from '@/lib/notices';

/** Shows the notice a redirect asked for (`/?notice=staff-only`), with a dismiss button. */
export default function DashboardNotice() {
  const message = noticeMessage(useSearchParams().get('notice'));
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  if (!message) return null;
  return (
    <div
      role="status"
      className="mb-6 flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => router.replace(pathname)}
        aria-label="Dismiss notice"
        className="ml-4 text-yellow-800 hover:text-yellow-900"
      >
        ×
      </button>
    </div>
  );
}
