// File: frontend/src/components/members/AddEditMemberModal.tsx
'use client';

import { useState, useEffect, useId } from 'react';
import { createUserInput, MIN_PASSWORD_LENGTH, updateUserInput } from '@embrace/shared';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '../../lib/forms/validate';
import Dialog from '../ui/Dialog';
import FieldError from '../ui/FieldError';
import InlineError from '../ui/InlineError';
import TextField from '../ui/TextField';
import { useRoles } from '../../lib/queries/roles';
import { useCreateUser, useUpdateUser } from '../../lib/queries/users';
import type { Member } from '../../types/domain';

const FIELDS = ['name', 'email', 'password', 'phone', 'bio', 'isActive', 'roleIds'] as const;

interface AddEditMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful save; the member queries are already invalidated. */
  onSave?: () => void;
  member?: Member | null;
}

export default function AddEditMemberModal({
  isOpen,
  onClose,
  onSave,
  member,
}: AddEditMemberModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    isActive: true,
    password: '',
  });
  // null until the user picks roles: a new member then defaults to the member role and an
  // edited member keeps their current roles.
  const [pickedRoles, setPickedRoles] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const rolesQuery = useRoles({ enabled: isOpen });
  const roles = rolesQuery.data ?? [];
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const loading = createUser.isPending || updateUser.isPending;
  const titleId = useId();

  const isEditing = !!member;
  const defaultRoles = member
    ? member.roles.map((ur) => ur.role.id)
    : roles.filter((r) => r.name === 'member').map((r) => r.id);
  const selectedRoles = pickedRoles ?? defaultRoles;

  // Reset the form whenever it opens or switches member (no data is fetched here).
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: member?.name ?? '',
        email: member?.email ?? '',
        phone: member?.phone || '',
        bio: member?.bio || '',
        isActive: member ? member.isActive : true,
        password: '',
      });
      setPickedRoles(null);
      setError('');
      setFieldErrors({});
    }
  }, [isOpen, member]);

  // Validates with the API's own schema (same rules and messages): the field errors, or the save
  // call with the schema's output (trimmed, blanks as null).
  const prepareSave = (): FieldErrors | (() => Promise<unknown>) => {
    if (isEditing && member) {
      // Only send role/status changes when they changed, because those fields need admin
      // (roles) or staff (status) permissions.
      const originalRoleIds = member.roles.map((ur) => ur.role.id).sort();
      const rolesChanged =
        JSON.stringify(originalRoleIds) !== JSON.stringify([...selectedRoles].sort());
      const checked = validateForm(updateUserInput, {
        name: formData.name,
        phone: formData.phone,
        bio: formData.bio,
        ...(formData.isActive !== member.isActive ? { isActive: formData.isActive } : {}),
        ...(rolesChanged ? { roleIds: selectedRoles } : {}),
      });
      if (!checked.ok) return checked.errors;
      return () => updateUser.mutateAsync({ id: member.id, input: checked.data });
    }
    // Create a new member (staff only). Self-registration uses /api/auth/register instead.
    const checked = validateForm(createUserInput, { ...formData, roleIds: selectedRoles });
    if (!checked.ok) return checked.errors;
    return () => createUser.mutateAsync(checked.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const save = prepareSave();
    if (typeof save !== 'function') {
      setFieldErrors(save);
      setError(save[FORM_ERROR_KEY] ?? '');
      return;
    }
    setFieldErrors({});
    setError('');

    try {
      await save();
      onSave?.();
      onClose();
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Failed to save the member');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    }
  };

  const handleRoleChange = (roleId: string) => {
    setPickedRoles(
      selectedRoles.includes(roleId)
        ? selectedRoles.filter((id) => id !== roleId)
        : [...selectedRoles, roleId],
    );
  };

  if (!isOpen) return null;

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <div>
        <h2 id={titleId} className="text-lg font-medium text-gray-900 mb-4">
          {isEditing ? 'Edit Member' : 'Add New Member'}
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded"
          >
            {error}
          </div>
        )}
        {rolesQuery.error && (
          <InlineError
            error={rolesQuery.error}
            fallback="Failed to load roles"
            onRetry={() => void rolesQuery.refetch()}
            className="mb-4"
          />
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            id="member-name"
            label="Full Name *"
            value={formData.name}
            onChange={(name) => setFormData((prev) => ({ ...prev, name }))}
            error={fieldErrors.name}
            required
            placeholder="John Doe"
          />
          <TextField
            id="member-email"
            label="Email *"
            type="email"
            value={formData.email}
            onChange={(email) => setFormData((prev) => ({ ...prev, email }))}
            error={fieldErrors.email}
            required
            disabled={isEditing} // Can't change email when editing
            className={isEditing ? 'bg-gray-100' : ''}
            placeholder="john@example.com"
          />
          {!isEditing && (
            <TextField
              id="member-password"
              label="Password *"
              type="password"
              value={formData.password}
              onChange={(password) => setFormData((prev) => ({ ...prev, password }))}
              error={fieldErrors.password}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              placeholder={`Temporary password (at least ${MIN_PASSWORD_LENGTH} characters)`}
            />
          )}
          <TextField
            id="member-phone"
            label="Phone"
            type="tel"
            value={formData.phone}
            onChange={(phone) => setFormData((prev) => ({ ...prev, phone }))}
            error={fieldErrors.phone}
            placeholder="(555) 123-4567"
          />

          <div>
            <label htmlFor="member-bio" className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              id="member-bio"
              {...fieldA11y('member-bio', fieldErrors.bio)}
              value={formData.bio}
              onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tell us about this member..."
            />
            <FieldError fieldId="member-bio" message={fieldErrors.bio} />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Roles</legend>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => handleRoleChange(role.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 capitalize">
                    {role.name}
                    {role.description && (
                      <span className="text-gray-500"> - {role.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <FieldError fieldId="member-roles" message={fieldErrors.roleIds} />
          </fieldset>

          <div className="flex items-center">
            <input
              id="member-active"
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="member-active" className="ml-2 text-sm text-gray-700">
              Active Member
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Update Member' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
