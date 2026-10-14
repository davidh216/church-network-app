import {
  fieldKind,
  optionsFor,
  takesChoices,
  takesNoValue,
  type DraftCondition,
} from '@/lib/members/searchQuery';
import {
  DELETED_LABEL,
  NO_CHOICES,
  NO_NAMES,
  referenceName,
  type SearchChoices,
  type SearchNames,
} from '@/lib/members/searchNames';

interface ConditionValueProps {
  draft: DraftCondition;
  /** 1-based position, used in the accessible names. */
  index: number;
  onChange: (updates: Partial<DraftCondition>) => void;
  /** The id of the inline error, when there is one. */
  errorId?: string;
  /** The tag and group choices, and the names of the ones a loaded query selects. */
  choices?: SearchChoices;
  names?: SearchNames;
}

const inputClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/** The value input(s) for one condition: typed by field, two inputs for `between`. */
export default function ConditionValue({
  draft,
  index,
  onChange,
  errorId,
  choices = NO_CHOICES,
  names = NO_NAMES,
}: ConditionValueProps) {
  const kind = fieldKind(draft.field);
  const invalid = errorId ? true : undefined;
  const label = `Condition ${index} value`;

  if (takesNoValue(draft.operator)) return null;

  if (takesChoices(draft.operator)) {
    const toggle = (value: string, checked: boolean) =>
      onChange({
        values: checked ? [...draft.values, value] : draft.values.filter((v) => v !== value),
      });
    return (
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1" aria-describedby={errorId}>
        <legend className="sr-only">{`Condition ${index} values`}</legend>
        {choiceList(kind, draft.values, choices, names).map(([value, text]) => (
          <label key={value} className="inline-flex items-center gap-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.values.includes(value)}
              onChange={(e) => toggle(value, e.target.checked)}
              className="h-4 w-4"
            />
            {text === DELETED_LABEL ? <DeletedChip /> : text}
          </label>
        ))}
        {(kind === 'tag' || kind === 'group') && optionsFor(kind, choices).length === 0 && (
          <span className="text-sm text-gray-600">
            {(kind === 'tag' ? names.tags : names.groups)
              ? `No ${kind}s to choose from`
              : 'Loading…'}
          </span>
        )}
      </fieldset>
    );
  }

  const options = optionsFor(kind);
  if (options.length) {
    return (
      <select
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={errorId}
        value={draft.value}
        onChange={(e) => onChange({ value: e.target.value })}
        className={inputClass}
      >
        <option value="">Choose...</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    );
  }

  const type = kind === 'date' ? 'date' : kind === 'score' ? 'number' : 'text';
  const input = (key: 'value' | 'value2', name: string) => (
    <input
      type={type}
      aria-label={name}
      aria-invalid={invalid}
      aria-describedby={errorId}
      value={draft[key]}
      onChange={(e) => onChange({ [key]: e.target.value })}
      placeholder={type === 'text' ? 'Enter value...' : undefined}
      className={`${inputClass} ${type === 'text' ? 'flex-1' : ''}`}
    />
  );

  if (draft.operator === 'between') {
    return (
      <span className="inline-flex items-center gap-2">
        {input('value', `Condition ${index} from`)}
        <span className="text-sm text-gray-600">and</span>
        {input('value2', `Condition ${index} to`)}
      </span>
    );
  }
  return input('value', label);
}

/**
 * The checkbox choices: the field's options, then any selected tag or group they lack (deleted,
 * or an archived group), so a loaded query can still be edited and the reference removed.
 */
function choiceList(
  kind: ReturnType<typeof fieldKind>,
  selected: string[],
  choices: SearchChoices,
  names: SearchNames,
): [string, string][] {
  const options = optionsFor(kind, choices);
  if (kind !== 'tag' && kind !== 'group') return options;
  const extra = selected
    .filter((id) => !options.some(([value]) => value === id))
    .map((id): [string, string] => [id, referenceName(names, kind, id).label]);
  return [...options, ...extra];
}

/** Marks a tag or group that no longer exists. */
export function DeletedChip() {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">
      {DELETED_LABEL}
    </span>
  );
}
