import type { TagChip as TagChipData } from '@embrace/shared';

/** The most tags a member row shows before "+n". */
export const MAX_ROW_TAGS = 3;

/**
 * One tag: its name on a neutral pill (readable whatever the colour) with a dot in the tag's
 * colour; an archived tag says so.
 */
export function TagChip({ tag }: { tag: TagChipData }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        tag.isActive
          ? 'border-gray-200 bg-gray-50 text-gray-800'
          : 'border-dashed border-gray-300 bg-white text-gray-600'
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      {tag.name}
      {!tag.isActive && <span className="italic"> (archived)</span>}
    </span>
  );
}

/** A member row's tags: at most MAX_ROW_TAGS chips, then "+n" naming the rest. */
export function MemberTagChips({ tags }: { tags: TagChipData[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, MAX_ROW_TAGS);
  const hidden = tags.slice(MAX_ROW_TAGS);
  return (
    <ul aria-label="Tags" className="flex flex-wrap gap-1 mt-1">
      {shown.map((tag) => (
        <li key={tag.id}>
          <TagChip tag={tag} />
        </li>
      ))}
      {hidden.length > 0 && (
        <li>
          <span
            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
            title={hidden.map((t) => t.name).join(', ')}
          >
            <span aria-hidden="true">+{hidden.length}</span>
            <span className="sr-only">
              and {hidden.length} more: {hidden.map((t) => t.name).join(', ')}
            </span>
          </span>
        </li>
      )}
    </ul>
  );
}
