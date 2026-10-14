'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isApiError } from '@/lib/api/client';
import { useHasRole } from '@/lib/auth/AuthProvider';
import { addressText } from '@/lib/families/display';
import { useFamily } from '@/lib/queries/families';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import AddFamilyMember from './AddFamilyMember';
import DeleteFamilyDialog from './DeleteFamilyDialog';
import FamilyDialog from './FamilyDialog';
import FamilyMembers from './FamilyMembers';
import FamilyRelationships from './FamilyRelationships';

const cardClass = 'p-5 border border-gray-200 shadow-sm rounded-md bg-white';
const backLink = 'text-sm font-medium text-blue-600 hover:text-blue-800';
const outlineButton =
  'px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * The `/families/[id]` route (staff): the family's name, address and head, its members (add,
 * remove, choose the head) and its relationships. Admins can also delete the family.
 */
export default function FamilyDetailPage({ id }: { id: string }) {
  const { data: family, error, isPending, refetch } = useFamily(id);
  const admin = useHasRole('admin');
  const router = useRouter();
  const [open, setOpen] = useState<'edit' | 'delete' | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (isPending) {
    return (
      <div className={cardClass}>
        <Skeleton rows={4} label="Loading the family" />
      </div>
    );
  }
  if (error || !family) {
    const retryable = error && !(isApiError(error) && error.status === 404);
    return (
      <div className={`${cardClass} space-y-4`}>
        <InlineError
          error={error}
          fallback="Family not found"
          onRetry={retryable ? () => void refetch() : undefined}
        />
        <Link href="/families" className={backLink}>
          ← Back to families
        </Link>
      </div>
    );
  }

  const facts: Array<[string, string | null]> = [
    ['Address', addressText(family)],
    ['Head of family', family.head?.name ?? 'Not set'],
  ];

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4 mb-4">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900 focus:outline-hidden"
        >
          {family.familyName} family
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={outlineButton} onClick={() => setOpen('edit')}>
            Edit
          </button>
          {admin && (
            <button
              type="button"
              onClick={() => setOpen('delete')}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500"
            >
              Delete
            </button>
          )}
          <Link href="/families" className={backLink}>
            ← Back to families
          </Link>
        </div>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="font-medium text-gray-700">{label}</dt>
            <dd className="text-gray-900">{value ?? 'Not recorded'}</dd>
          </div>
        ))}
      </dl>

      <FamilyMembers family={family} />
      <AddFamilyMember
        familyId={family.id}
        familyName={family.familyName}
        memberIds={family.members.map((m) => m.id)}
      />
      <FamilyRelationships family={family} />

      {open === 'edit' && (
        <FamilyDialog
          family={family}
          onClose={() => setOpen(null)}
          onSaved={() => setOpen(null)}
          fallbackFocus={headingRef}
        />
      )}
      {open === 'delete' && (
        <DeleteFamilyDialog
          family={family}
          onClose={() => setOpen(null)}
          onDeleted={() => router.replace('/families')}
          fallbackFocus={headingRef}
        />
      )}
    </div>
  );
}
