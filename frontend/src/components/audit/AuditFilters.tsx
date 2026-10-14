import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@embrace/shared';
import { actionLabel } from '@/lib/audit/display';
import { fieldA11y } from '@/lib/forms/validate';
import FieldError from '@/components/ui/FieldError';

export interface AuditFilterValues {
  action: string;
  targetType: string;
  from: string;
  to: string;
  /** Set from a row's "Only" buttons and shown as removable chips. */
  actor: { id: string; name: string } | null;
  target: { type: string; id: string; name: string } | null;
}

export const EMPTY_AUDIT_FILTERS: AuditFilterValues = {
  action: '',
  targetType: '',
  from: '',
  to: '',
  actor: null,
  target: null,
};

interface AuditFiltersProps {
  filters: AuditFilterValues;
  onChange: (filters: AuditFilterValues) => void;
  /** Shown under "To" when the range is reversed. */
  dateError: string | null;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const chipClass =
  'inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 text-sm pl-3 pr-1 py-0.5';
const chipButtonClass =
  'rounded-full px-1.5 hover:bg-blue-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

const DATES_HINT_ID = 'audit-dates-hint';

/** The audit log's filters: action, target type, an inclusive date range and the chips. */
export default function AuditFilters({ filters, onChange, dateError }: AuditFiltersProps) {
  const set = (patch: Partial<AuditFilterValues>) => onChange({ ...filters, ...patch });
  const toA11y = fieldA11y('audit-to', dateError ?? undefined);
  return (
    <div className="px-4 py-4 border-b space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="audit-action" className={labelClass}>
            Action
          </label>
          <select
            id="audit-action"
            value={filters.action}
            onChange={(e) => set({ action: e.target.value })}
            className={inputClass}
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-target-type" className={labelClass}>
            Target type
          </label>
          <select
            id="audit-target-type"
            value={filters.target ? filters.target.type : filters.targetType}
            disabled={!!filters.target}
            onChange={(e) => set({ targetType: e.target.value })}
            className={inputClass}
          >
            <option value="">All types</option>
            {AUDIT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className={labelClass}>
            From (UTC)
          </label>
          <input
            id="audit-from"
            type="date"
            value={filters.from}
            aria-describedby={DATES_HINT_ID}
            onChange={(e) => set({ from: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="audit-to" className={labelClass}>
            To (UTC)
          </label>
          <input
            id="audit-to"
            type="date"
            value={filters.to}
            {...toA11y}
            aria-describedby={[DATES_HINT_ID, toA11y['aria-describedby']].filter(Boolean).join(' ')}
            onChange={(e) => set({ to: e.target.value })}
            className={inputClass}
          />
          <FieldError fieldId="audit-to" message={dateError ?? undefined} />
        </div>
      </div>
      <p id={DATES_HINT_ID} className="text-xs text-gray-500">
        The date range uses UTC days, while times in the log are local, so an event near midnight
        may fall on the day before or after.
      </p>
      {(filters.actor || filters.target) && (
        <ul aria-label="Applied filters" className="flex flex-wrap gap-2">
          {filters.actor && (
            <li className={chipClass}>
              By {filters.actor.name}
              <button
                type="button"
                className={chipButtonClass}
                onClick={() => set({ actor: null })}
                aria-label={`Remove filter: by ${filters.actor.name}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          )}
          {filters.target && (
            <li className={chipClass}>
              {filters.target.type}: {filters.target.name}
              <button
                type="button"
                className={chipButtonClass}
                onClick={() => set({ target: null })}
                aria-label={`Remove filter: ${filters.target.name}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
