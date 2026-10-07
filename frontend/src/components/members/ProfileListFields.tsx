import { MAX_PROFILE_LIST_ITEMS } from '@embrace/shared';
import ChipInput from '@/components/ui/ChipInput';
import type { FieldErrors } from '@/lib/forms/validate';
import type { ProfileLists } from '@/lib/members/memberForm';

interface ProfileListFieldsProps {
  /** Prefix of the two inputs' ids ("member" -> "member-skills", "member-interests"). */
  idPrefix: string;
  lists: ProfileLists;
  onChange: (lists: ProfileLists) => void;
  errors: FieldErrors;
}

/** Volunteer skills and interests edited as chips (the staff member form and the own profile). */
export default function ProfileListFields({
  idPrefix,
  lists,
  onChange,
  errors,
}: ProfileListFieldsProps) {
  return (
    <>
      <ChipInput
        id={`${idPrefix}-skills`}
        label="Volunteer Skills"
        values={lists.volunteerSkills}
        onChange={(volunteerSkills) => onChange({ ...lists, volunteerSkills })}
        error={errors.volunteerSkills}
        maxItems={MAX_PROFILE_LIST_ITEMS}
      />
      <ChipInput
        id={`${idPrefix}-interests`}
        label="Interests"
        values={lists.interests}
        onChange={(interests) => onChange({ ...lists, interests })}
        error={errors.interests}
        maxItems={MAX_PROFILE_LIST_ITEMS}
      />
    </>
  );
}
