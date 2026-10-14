'use client';

import { relationshipLabel } from '@/lib/families/display';
import { useOwnFamily } from '@/lib/queries/families';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';

/** The signed-in user's own family, read only: its name and each relative's relation to them. */
export default function OwnFamily({ headingId }: { headingId: string }) {
  const { data, error, isPending, refetch } = useOwnFamily();

  let body;
  if (error && data === undefined) {
    body = (
      <InlineError
        error={error}
        fallback="Failed to load your family"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending) {
    body = <Skeleton rows={2} label="Loading your family" />;
  } else if (!data) {
    body = <p className="text-sm text-gray-600">You are not linked to a family yet.</p>;
  } else {
    body = (
      <>
        <p className="text-sm text-gray-900">The {data.familyName} family</p>
        {data.relatives.length === 0 ? (
          <p className="text-sm text-gray-600">Nobody else is in your family yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {data.relatives.map((relative, index) => (
              <li
                key={`${relative.name}-${index}`}
                className="py-2 flex flex-wrap items-baseline justify-between gap-2"
              >
                <span className="font-medium text-gray-900">{relative.name}</span>
                <span className="text-sm text-gray-700">
                  {relative.relationship
                    ? relationshipLabel(relative.relationship)
                    : 'Family member'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h2 id={headingId} className="text-lg font-medium text-gray-900 mb-2">
        My family
      </h2>
      {body}
    </section>
  );
}
