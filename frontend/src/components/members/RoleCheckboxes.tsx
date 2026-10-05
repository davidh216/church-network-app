import type { Role } from '@/types/domain';
import FieldError from '@/components/ui/FieldError';

interface RoleCheckboxesProps {
  roles: Role[];
  selected: string[];
  onToggle: (roleId: string) => void;
  error?: string;
}

/** The member form's role checkboxes, one per role with its description. */
export default function RoleCheckboxes({ roles, selected, onToggle, error }: RoleCheckboxesProps) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-gray-700 mb-2">Roles</legend>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center">
            <input
              type="checkbox"
              checked={selected.includes(role.id)}
              onChange={() => onToggle(role.id)}
              className="rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700 capitalize">
              {role.name}
              {role.description && <span className="text-gray-500"> - {role.description}</span>}
            </span>
          </label>
        ))}
      </div>
      <FieldError fieldId="member-roles" message={error} />
    </fieldset>
  );
}
