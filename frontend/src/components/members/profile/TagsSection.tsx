'use client';

import { useRef, useState } from 'react';
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
 *
 * Nothing can be edited until the tags have loaded, and edits are saved one at a time: while one
 * is saving the picker is read-only, so a second edit can neither be lost nor undo the first's
 * chips. The status announces a change only once it has been saved.
 */
export default function TagsSection({ member }: { member: MemberDetails }) {
  const assigned = member.memberTags ?? [];
  // Archived tags too, so a typed archived name is explained rather than called unknown.
  const { data: allTags, error: loadError } = useTags(true);
  const assign = useAssignTag();
  const unassign = useUnassignTag();
  // The chips while a change is being saved, so an added or removed chip shows at once.
  const [pending, setPending] = useState<string[] | null>(null);
  // Set synchronously, so an edit made before the re-render cannot start a second save.
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const names = pending ?? assigned.map((a) => a.tag.name);
  const archived = assigned.filter((a) => !a.tag.isActive).map((a) => a.tag.name);
  const activeTags = allTags?.filter((t) => t.isActive);
  const suggestions = (activeTags ?? [])
    .map((t) => t.name)
    .filter((name) => !names.some((n) => same(n, name)));
  const findTag = (name: string) => allTags?.find((t) => same(t.name, name));
  const findActive = (name: string) => activeTags?.find((t) => same(t.name, name));

  const save = async (next: string[], done: string, change: () => Promise<unknown>) => {
    if (saving.current) return;
    saving.current = true;
    setError('');
    setAnnouncement('');
    setPending(next);
    try {
      await change();
      setAnnouncement(done);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update the tags'));
    } finally {
      saving.current = false;
      setPending(null);
    }
  };

  // Runs before ChipInput accepts a typed name: a refusal keeps the text with this reason.
  const validate = (name: string) => {
    if (findActive(name)) return null;
    const tag = findTag(name);
    if (tag) return `${tag.name} is archived; restore it in Manage Tags.`;
    return `There is no active tag called "${name}". Create it with Manage Tags.`;
  };

  const onChange = (next: string[]) => {
    const added = next.find((n) => !names.some((old) => same(old, n)));
    const removed = names.find((old) => !next.some((n) => same(old, n)));
    if (added !== undefined) {
      const tag = findActive(added);
      if (!tag) return;
      void save(next, `Added ${tag.name}`, () =>
        assign.mutateAsync({ userId: member.id, tagId: tag.id }),
      );
    } else if (removed !== undefined) {
      const assignment = assigned.find((a) => same(a.tag.name, removed));
      if (!assignment) return;
      void save(next, `Removed ${assignment.tag.name}`, () =>
        unassign.mutateAsync({ userId: member.id, tagId: assignment.tag.id }),
      );
    }
  };

  const loading = !allTags && !loadError;
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
        validate={validate}
        readOnly={!allTags || pending !== null}
        announceChanges={false}
        formatChip={(name) => (archived.some((a) => same(a, name)) ? `${name} (archived)` : name)}
        placeholder={loading ? 'Loading tags…' : pending ? 'Saving…' : 'Type a tag name'}
      />
      <p role="status" className="mt-1 text-xs text-gray-600">
        {loading ? 'Loading tags…' : pending ? 'Saving…' : announcement}
      </p>
      {(error || loadError) && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error || getErrorMessage(loadError, 'Failed to load the tags')}
        </p>
      )}
    </section>
  );
}
