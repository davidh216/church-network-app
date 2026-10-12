'use client';

import { useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import { useAssignTag, useTags, useUnassignTag } from '@/lib/queries/tags';
import type { MemberDetails } from '@/types/domain';
import ChipInput from '@/components/ui/ChipInput';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The profile's Tags section (staff only; members never see tags). The picker is a ChipInput
 * whose suggestions are the active tags the member does not have yet: adding a chip assigns the
 * tag, removing one unassigns it. Archived tags stay listed, marked as archived, and can be
 * removed but not added again.
 */
export default function TagsSection({ member }: { member: MemberDetails }) {
  const assigned = member.memberTags ?? [];
  const { data: activeTags, error: loadError } = useTags(false);
  const assign = useAssignTag();
  const unassign = useUnassignTag();
  // The chips while a change is being saved, so an added or removed chip shows at once.
  const [pending, setPending] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const names = pending ?? assigned.map((a) => a.tag.name);
  const archived = assigned.filter((a) => !a.tag.isActive).map((a) => a.tag.name);
  const suggestions = (activeTags ?? [])
    .map((t) => t.name)
    .filter((name) => !names.some((n) => same(n, name)));
  const findActive = (name: string) => activeTags?.find((t) => same(t.name, name));

  const save = async (next: string[], change: () => Promise<unknown>) => {
    setError('');
    setPending(next);
    try {
      await change();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update the tags'));
    } finally {
      setPending(null);
    }
  };

  const onChange = (next: string[]) => {
    const added = next.find((n) => !names.some((old) => same(old, n)));
    const removed = names.find((old) => !next.some((n) => same(old, n)));
    if (added !== undefined) {
      const tag = findActive(added);
      if (!tag) {
        setError(`There is no active tag called "${added}". Create it with Manage Tags.`);
        return;
      }
      void save(next, () => assign.mutateAsync({ userId: member.id, tagId: tag.id }));
    } else if (removed !== undefined) {
      const assignment = assigned.find((a) => same(a.tag.name, removed));
      if (!assignment) return;
      void save(next, () => unassign.mutateAsync({ userId: member.id, tagId: assignment.tag.id }));
    }
  };

  return (
    <section aria-labelledby="profile-tags-heading" className="mb-6">
      <h2 id="profile-tags-heading" className="sr-only">
        Tags
      </h2>
      <ChipInput
        id="profile-tags"
        label="Tags (staff only)"
        values={names}
        onChange={onChange}
        suggestions={suggestions}
        maxLength={40}
        // A typed name becomes the tag's own spelling.
        normalize={(value) => findActive(value)?.name ?? value}
        formatChip={(name) => (archived.some((a) => same(a, name)) ? `${name} (archived)` : name)}
        placeholder={pending ? 'Saving...' : 'Type a tag name'}
      />
      {(error || loadError) && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error || getErrorMessage(loadError, 'Failed to load the tags')}
        </p>
      )}
    </section>
  );
}
