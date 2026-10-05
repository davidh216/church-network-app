import type { SearchField, SearchOperator } from '@embrace/shared';
import {
  OPERATOR_LABELS,
  SEARCH_FIELDS,
  operatorsFor,
  withField,
  type DraftCondition,
} from '../../../lib/members/searchQuery';
import ConditionValue from './ConditionValue';

interface ConditionRowProps {
  draft: DraftCondition;
  /** 1-based position, used in the accessible names. */
  index: number;
  error?: string;
  canRemove: boolean;
  onChange: (draft: DraftCondition) => void;
  onRemove: () => void;
}

const selectClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** One condition of the advanced search: field, an operator allowed for it, and its value. */
export default function ConditionRow({
  draft,
  index,
  error,
  canRemove,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const errorId = error ? `condition-${draft.key}-error` : undefined;
  return (
    <li className="p-3 bg-gray-50 rounded-md">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={`Condition ${index} field`}
          value={draft.field}
          onChange={(e) => onChange(withField(draft, e.target.value as SearchField))}
          className={selectClass}
        >
          {SEARCH_FIELDS.map(({ field, label }) => (
            <option key={field} value={field}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label={`Condition ${index} operator`}
          value={draft.operator}
          onChange={(e) =>
            onChange({
              ...draft,
              operator: e.target.value as SearchOperator,
              value: '',
              value2: '',
              values: [],
            })
          }
          className={selectClass}
        >
          {operatorsFor(draft.field).map((operator) => (
            <option key={operator} value={operator}>
              {OPERATOR_LABELS[operator]}
            </option>
          ))}
        </select>

        <ConditionValue
          draft={draft}
          index={index}
          errorId={errorId}
          onChange={(updates) => onChange({ ...draft, ...updates })}
        />

        <button
          type="button"
          aria-label={`Remove condition ${index}`}
          onClick={onRemove}
          disabled={!canRemove}
          className="ml-auto p-1 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
      {error && (
        <p id={errorId} className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}
