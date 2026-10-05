import { fieldKind, optionsFor, type DraftCondition } from '../../../lib/members/searchQuery';

interface ConditionValueProps {
  draft: DraftCondition;
  /** 1-based position, used in the accessible names. */
  index: number;
  onChange: (updates: Partial<DraftCondition>) => void;
  /** The id of the inline error, when there is one. */
  errorId?: string;
}

const inputClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** The value input(s) for one condition: typed by field, two inputs for `between`. */
export default function ConditionValue({ draft, index, onChange, errorId }: ConditionValueProps) {
  const kind = fieldKind(draft.field);
  const invalid = errorId ? true : undefined;
  const label = `Condition ${index} value`;

  if (draft.operator === 'isEmpty') return null;

  if (draft.operator === 'in') {
    const toggle = (value: string, checked: boolean) =>
      onChange({
        values: checked ? [...draft.values, value] : draft.values.filter((v) => v !== value),
      });
    return (
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1" aria-describedby={errorId}>
        <legend className="sr-only">{`Condition ${index} values`}</legend>
        {optionsFor(kind).map(([value, text]) => (
          <label key={value} className="inline-flex items-center gap-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.values.includes(value)}
              onChange={(e) => toggle(value, e.target.checked)}
              className="h-4 w-4"
            />
            {text}
          </label>
        ))}
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
