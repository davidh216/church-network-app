'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  createFamilyInput,
  MAX_FAMILY_ADDRESS,
  MAX_FAMILY_CITY,
  MAX_FAMILY_COUNTRY,
  MAX_FAMILY_NAME,
  MAX_FAMILY_STATE,
  MAX_FAMILY_ZIP,
  type FamilyDetail,
} from '@embrace/shared';
import { apiErrorsFor, FORM_ERROR_KEY, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { useCreateFamily, useUpdateFamily } from '@/lib/queries/families';
import Dialog from '@/components/ui/Dialog';
import TextField from '@/components/ui/TextField';

interface FamilyDialogProps {
  /** The family to edit; without it the dialog creates one. */
  family?: FamilyDetail;
  onClose: () => void;
  /** Called with the saved family (the family queries are already invalidated). */
  onSaved: (family: FamilyDetail) => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
}

const FIELDS = ['familyName', 'address', 'city', 'state', 'zipCode', 'country'] as const;
type Form = Record<(typeof FIELDS)[number], string>;

/**
 * Staff form for creating a family or editing its name and address. An edit sends only the
 * fields that changed; a blank address field clears it. Members and the head are managed on the
 * family's page. A failed save focuses the first invalid field, or the message.
 */
export default function FamilyDialog({
  family,
  onClose,
  onSaved,
  fallbackFocus,
}: FamilyDialogProps) {
  const [form, setForm] = useState<Form>({
    familyName: family?.familyName ?? '',
    address: family?.address ?? '',
    city: family?.city ?? '',
    state: family?.state ?? '',
    zipCode: family?.zipCode ?? '',
    country: family?.country ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failures, setFailures] = useState(0);
  const createFamily = useCreateFamily();
  const updateFamily = useUpdateFamily();
  const saving = createFamily.isPending || updateFamily.isPending;
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof Form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (failures === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? alertRef.current)?.focus();
  }, [failures]);

  const fail = (errors: FieldErrors, message: string) => {
    setFieldErrors(errors);
    setError(message);
    setFailures((n) => n + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const checked = validateForm(createFamilyInput, form);
    if (!checked.ok) {
      fail(checked.errors, checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    const data = checked.data;
    try {
      if (family) {
        const changes = Object.fromEntries(
          FIELDS.filter((key) => (data[key] ?? null) !== family[key]).map((key) => [
            key,
            data[key] ?? null,
          ]),
        );
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        onSaved(await updateFamily.mutateAsync({ id: family.id, input: changes }));
      } else {
        onSaved(await createFamily.mutateAsync(data));
      }
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to save the family');
      fail(failed.fieldErrors, failed.message);
    }
  };

  const text = (key: keyof Form, label: string, max: number) => (
    <TextField
      id={`family-${key}`}
      label={label}
      value={form[key]}
      maxLength={max}
      onChange={set(key)}
      error={fieldErrors[key]}
    />
  );

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
      className="relative mx-auto mt-16 w-full max-w-lg rounded-md border bg-white p-5 shadow-lg"
    >
      <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
        {family ? 'Edit Family' : 'New Family'}
      </h2>
      {error && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {text('familyName', 'Family name *', MAX_FAMILY_NAME)}
        {text('address', 'Address', MAX_FAMILY_ADDRESS)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {text('city', 'City', MAX_FAMILY_CITY)}
          {text('state', 'State', MAX_FAMILY_STATE)}
          {text('zipCode', 'ZIP code', MAX_FAMILY_ZIP)}
          {text('country', 'Country', MAX_FAMILY_COUNTRY)}
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
            {saving ? 'Saving...' : family ? 'Save Changes' : 'Create Family'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
