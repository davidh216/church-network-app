'use client';

import { useId, useState, type FormEvent, type RefObject } from 'react';
import { createServiceInput, SERVICE_TYPES, type Service, type ServiceType } from '@embrace/shared';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '@/lib/forms/validate';
import { enumOptions } from '@/lib/members/display';
import { useCreateService, useUpdateService } from '@/lib/queries/services';
import Dialog from '@/components/ui/Dialog';
import FieldError from '@/components/ui/FieldError';

interface ServiceDialogProps {
  /** The service to edit; without it the dialog creates one. */
  service?: Service;
  /** The date a new service starts with (`YYYY-MM-DD`). */
  defaultDate: string;
  onClose: () => void;
  /** Called with the saved service (the service queries are already invalidated). */
  onSaved: (service: Service) => void;
  /** Focused on close when the control that opened the dialog is gone (the page heading). */
  fallbackFocus?: RefObject<HTMLElement | null>;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const FIELDS = ['date', 'type', 'title', 'notes'] as const;
const TYPE_OPTIONS = enumOptions(SERVICE_TYPES);

/**
 * Staff form for creating or editing a service. A second service of the same type on the same
 * date is refused by the API (409), and its message is shown in the dialog.
 */
export default function ServiceDialog({
  service,
  defaultDate,
  onClose,
  onSaved,
  fallbackFocus,
}: ServiceDialogProps) {
  const [form, setForm] = useState({
    date: service?.date ?? defaultDate,
    type: service?.type ?? ('sunday_service' as ServiceType),
    title: service?.title ?? '',
    notes: service?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const createService = useCreateService();
  const updateService = useUpdateService();
  const saving = createService.isPending || updateService.isPending;
  const titleId = useId();
  const heading = service ? 'Edit Service' : 'New Service';

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // The full form is valid input for both routes (an edit sends every field).
    const checked = validateForm(createServiceInput, form);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setError(checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    setFieldErrors({});
    setError('');
    try {
      const saved = service
        ? await updateService.mutateAsync({ id: service.id, input: checked.data })
        : await createService.mutateAsync(checked.data);
      onSaved(saved);
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to save the service');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    }
  };

  return (
    <Dialog labelledBy={titleId} onClose={onClose} fallbackFocus={fallbackFocus}>
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
        {heading}
      </h2>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="service-date" className={labelClass}>
            Date *
          </label>
          <input
            id="service-date"
            {...fieldA11y('service-date', fieldErrors.date)}
            type="date"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
            required
            className={inputClass}
          />
          <FieldError fieldId="service-date" message={fieldErrors.date} />
        </div>

        <div>
          <label htmlFor="service-type" className={labelClass}>
            Type *
          </label>
          <select
            id="service-type"
            {...fieldA11y('service-type', fieldErrors.type)}
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
            className={inputClass}
          >
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError fieldId="service-type" message={fieldErrors.type} />
        </div>

        <div>
          <label htmlFor="service-title" className={labelClass}>
            Title
          </label>
          <input
            id="service-title"
            {...fieldA11y('service-title', fieldErrors.title)}
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className={inputClass}
            placeholder="Harvest Sunday"
          />
          <FieldError fieldId="service-title" message={fieldErrors.title} />
        </div>

        <div>
          <label htmlFor="service-notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="service-notes"
            {...fieldA11y('service-notes', fieldErrors.notes)}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            className={inputClass}
          />
          <FieldError fieldId="service-notes" message={fieldErrors.notes} />
        </div>

        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-hidden focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : service ? 'Save Changes' : 'Create Service'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
