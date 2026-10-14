import { referenceName, type SearchChoices, type SearchNames } from '@/lib/members/searchNames';
import type { MemberFilters } from '@/lib/members/filters';

interface TagGroupFiltersProps {
  tag: string;
  group: string;
  onFilterChange: (key: 'tag' | 'group', value: string) => void;
  names: SearchNames;
  choices: SearchChoices;
  className: string;
}

const SELECTS = [
  { key: 'tag', label: 'Tag', all: 'All Tags' },
  { key: 'group', label: 'Group', all: 'All Groups' },
] as const satisfies readonly { key: keyof MemberFilters; label: string; all: string }[];

/**
 * The staff quick filters by tag and by group (PHASE5_SPECS.md G5). A selected id that is not
 * among the choices (a deleted tag, or an archived group) stays selectable under its name or
 * "(deleted)", so the select never shows a value it does not list.
 */
export default function TagGroupFilters({
  tag,
  group,
  onFilterChange,
  names,
  choices,
  className,
}: TagGroupFiltersProps) {
  const values = { tag, group };
  return (
    <>
      {SELECTS.map(({ key, label, all }) => {
        const value = values[key];
        const options = choices[key];
        const missing = value !== 'all' && !options.some(([id]) => id === value);
        return (
          <select
            key={key}
            aria-label={label}
            value={value}
            onChange={(e) => onFilterChange(key, e.target.value)}
            className={className}
          >
            <option value="all">{all}</option>
            {missing && <option value={value}>{referenceName(names, key, value).label}</option>}
            {options.map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        );
      })}
    </>
  );
}
