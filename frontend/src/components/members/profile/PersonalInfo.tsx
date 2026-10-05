import type { MemberDetails } from '@/types/domain';
import { formatDate } from '@/lib/members/profile';
import { Field } from './Field';

/** The "Personal Info" tab: basic information, emergency contact and bio. */
export default function PersonalInfo({ member }: { member: MemberDetails }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name">{member.firstName || 'Not set'}</Field>
          <Field label="Last Name">{member.lastName || 'Not set'}</Field>
        </div>
        <Field label="Date of Birth">{formatDate(member.dateOfBirth)}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Gender" className="text-sm text-gray-900 capitalize">
            {member.gender || 'Not specified'}
          </Field>
          <Field label="Marital Status" className="text-sm text-gray-900 capitalize">
            {member.maritalStatus || 'Not specified'}
          </Field>
        </div>
        <Field label="Occupation">{member.occupation || 'Not specified'}</Field>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Emergency Contact</h3>
        <Field label="Emergency Contact Name">{member.emergencyContact || 'Not set'}</Field>
        <Field label="Emergency Phone">{member.emergencyPhone || 'Not set'}</Field>
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900">Bio</h3>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">
            {member.bio || 'No bio available'}
          </p>
        </div>
      </div>
    </div>
  );
}
