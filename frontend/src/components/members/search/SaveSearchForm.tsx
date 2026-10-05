import { useState } from 'react';

export interface SaveSearchValues {
  name: string;
  description: string;
  isPublic: boolean;
}

interface SaveSearchFormProps {
  /** One line describing the query being saved. */
  summary: string;
  saving: boolean;
  onSave: (values: SaveSearchValues) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Names the current query (advanced conditions or the quick filters) before saving it. */
export default function SaveSearchForm({ summary, saving, onSave, onCancel }: SaveSearchFormProps) {
  const [values, setValues] = useState<SaveSearchValues>({
    name: '',
    description: '',
    isPublic: false,
  });

  return (
    <form
      className="mb-6 p-4 bg-blue-50 rounded-lg space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (values.name.trim()) onSave(values);
      }}
    >
      <h4 className="text-sm font-medium text-gray-900">Save Current Search</h4>
      <p className="text-xs text-gray-600">{summary}</p>
      <input
        type="text"
        aria-label="Search name"
        placeholder="Search name..."
        value={values.name}
        onChange={(e) => setValues({ ...values, name: e.target.value })}
        className={inputClass}
      />
      <textarea
        aria-label="Description (optional)"
        placeholder="Description (optional)..."
        value={values.description}
        onChange={(e) => setValues({ ...values, description: e.target.value })}
        rows={2}
        className={inputClass}
      />
      <label className="flex items-center">
        <input
          type="checkbox"
          checked={values.isPublic}
          onChange={(e) => setValues({ ...values, isPublic: e.target.checked })}
          className="h-4 w-4 border-gray-300 rounded-sm"
        />
        <span className="ml-2 text-sm text-gray-700">Share with other users</span>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!values.name.trim() || saving}
          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
