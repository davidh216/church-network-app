'use client';

import { useState } from 'react';
import type { SearchQuery } from '@embrace/shared';
import {
  buildSearchQuery,
  draftsFromQuery,
  newDraft,
  type DraftCondition,
} from '@/lib/members/searchQuery';
import ConditionRow from './search/ConditionRow';

const MAX_CONDITIONS = 10;

interface AdvancedSearchBuilderProps {
  /** The query to start from: the active advanced query, or the quick filters as conditions. */
  initialQuery: SearchQuery | null;
  onApply: (query: SearchQuery) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Builds a `searchQuery` for POST /api/users/search: each field offers only its operators and
 * a value input of the right type, and the shared schema validates before anything is sent.
 */
export default function AdvancedSearchBuilder({
  initialQuery,
  onApply,
  onClear,
  onClose,
}: AdvancedSearchBuilderProps) {
  const [drafts, setDrafts] = useState<DraftCondition[]>(() =>
    initialQuery ? draftsFromQuery(initialQuery) : [newDraft()],
  );
  const [logic, setLogic] = useState<'AND' | 'OR'>(initialQuery?.logic ?? 'AND');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (next: DraftCondition) =>
    setDrafts((prev) => prev.map((d) => (d.key === next.key ? next : d)));
  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const apply = () => {
    const result = buildSearchQuery(drafts, logic);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onApply(result.query);
  };

  const invalidCount = Object.keys(errors).length;

  return (
    <section
      aria-labelledby="advanced-search-heading"
      className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 m-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 id="advanced-search-heading" className="text-lg font-medium text-gray-900">
          Advanced Search
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close advanced search"
        >
          <svg
            aria-hidden="true"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm text-gray-700">
        <label htmlFor="advanced-search-logic">Match</label>
        <select
          id="advanced-search-logic"
          value={logic}
          onChange={(e) => setLogic(e.target.value as 'AND' | 'OR')}
          className="px-2 py-1 text-sm border border-gray-300 rounded-sm"
        >
          <option value="AND">all conditions (AND)</option>
          <option value="OR">any condition (OR)</option>
        </select>
      </div>

      <ul className="space-y-3">
        {drafts.map((draft, i) => (
          <ConditionRow
            key={draft.key}
            draft={draft}
            index={i + 1}
            error={errors[draft.key]}
            canRemove={drafts.length > 1}
            onChange={update}
            onRemove={() => remove(draft.key)}
          />
        ))}
      </ul>

      {invalidCount > 0 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {errors.form ?? `Fix ${invalidCount === 1 ? 'the condition' : 'the conditions'} above.`}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
        <button
          type="button"
          onClick={() => setDrafts((prev) => [...prev, newDraft()])}
          disabled={drafts.length >= MAX_CONDITIONS}
          className="px-3 py-2 border border-gray-300 shadow-xs text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Add Condition
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClear}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Clear Search
          </button>
          <button
            type="button"
            onClick={apply}
            className="px-4 py-2 rounded-md shadow-xs text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Apply Search
          </button>
        </div>
      </div>
    </section>
  );
}
