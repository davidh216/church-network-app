import { MAX_PERSON_NAME_PART } from '@embrace/shared';
import TextField from '@/components/ui/TextField';
import type { FieldErrors } from '@/lib/forms/validate';

export interface MemberNames {
  name: string;
  firstName: string;
  lastName: string;
}

interface MemberNameFieldsProps {
  values: MemberNames;
  onChange: (key: keyof MemberNames, value: string) => void;
  errors: FieldErrors;
}

/**
 * The member form's names: the required display name, then the optional first and last names
 * (used for initials when both are set; a blank one is stored as not set).
 */
export default function MemberNameFields({ values, onChange, errors }: MemberNameFieldsProps) {
  return (
    <>
      <TextField
        id="member-name"
        label="Full Name *"
        value={values.name}
        onChange={(name) => onChange('name', name)}
        error={errors.name}
        required
        placeholder="John Doe"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          id="member-first-name"
          label="First name"
          value={values.firstName}
          onChange={(firstName) => onChange('firstName', firstName)}
          error={errors.firstName}
          maxLength={MAX_PERSON_NAME_PART}
          autoComplete="off"
        />
        <TextField
          id="member-last-name"
          label="Last name"
          value={values.lastName}
          onChange={(lastName) => onChange('lastName', lastName)}
          error={errors.lastName}
          maxLength={MAX_PERSON_NAME_PART}
          autoComplete="off"
        />
      </div>
    </>
  );
}
