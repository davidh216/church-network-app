'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEFAULT_FAMILY_PAGE_SIZE } from '@embrace/shared';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFamilies } from '@/lib/queries/families';
import InlineError from '@/components/ui/InlineError';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import TextField from '@/components/ui/TextField';
import FamilyDialog from './FamilyDialog';

/**
 * The `/families` route (staff): families by name with a name search, their head and member
 * count, and "New Family". Each family opens its own page.
 */
export default function FamiliesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const q = useDebouncedValue(search.trim());
  const params = { q: q || undefined, page, pageSize: DEFAULT_FAMILY_PAGE_SIZE };
  const { data, error, isPending, isPlaceholderData, refetch } = useFamilies(params);

  let body;
  if (error && !data) {
    body = (
      <InlineError
        error={error}
        fallback="Failed to load the families"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending || !data) {
    body = <Skeleton rows={3} label="Loading families" className="p-4" />;
  } else if (data.families.length === 0) {
    body = (
      <p className="px-4 py-6 text-sm text-gray-600">
        {q ? `No family matches “${q}”.` : 'No families yet.'}
      </p>
    );
  } else {
    body = (
      <>
        <ul className="divide-y divide-gray-200">
          {data.families.map((family) => (
            <li
              key={family.id}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
            >
              <span>
                <Link
                  href={`/families/${encodeURIComponent(family.id)}`}
                  className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {family.familyName}
                </Link>
                {family.city && <span className="ml-2 text-sm text-gray-600">{family.city}</span>}
              </span>
              <span className="text-sm text-gray-700">
                {family.memberCount} {family.memberCount === 1 ? 'member' : 'members'}
                {family.head ? ` · Head: ${family.head.name}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <Pagination
          total={data.total}
          page={data.page}
          pageSize={data.pageSize}
          onPageChange={setPage}
          itemLabel="families"
        />
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900 focus:outline-hidden"
        >
          Families
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          New Family
        </button>
      </div>

      <section
        aria-labelledby="families-list"
        aria-busy={isPlaceholderData}
        className="bg-white shadow-sm rounded-lg"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3 border-b">
          <h2 id="families-list" className="text-lg font-medium text-gray-900">
            All families
          </h2>
          <div className="w-full sm:w-64">
            <TextField
              id="families-search"
              label="Search by name"
              type="search"
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              autoComplete="off"
            />
          </div>
        </div>
        {body}
      </section>

      {creating && (
        <FamilyDialog
          onClose={() => setCreating(false)}
          onSaved={(family) => {
            setCreating(false);
            router.push(`/families/${encodeURIComponent(family.id)}`);
          }}
          fallbackFocus={headingRef}
        />
      )}
    </div>
  );
}
