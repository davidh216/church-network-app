import type { MemberDetails } from '@/types/domain';
import { initials } from '@/lib/members/display';
import { Field, SectionHeader, pillClass } from './Field';
import AvatarImage from '@/components/ui/AvatarImage';

/** The "Family" tab: family role and id, and the linked family members. */
export default function Family({ member }: { member: MemberDetails }) {
  const family = member.familyMembers ?? [];
  return (
    <div className="space-y-6">
      <SectionHeader title="Family Information" count={`${family.length} family members`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900">Family Status</h4>
          <Field label="Family Role">
            {member.isHeadOfFamily ? 'Head of Family' : 'Family Member'}
          </Field>
          <Field label="Family ID">{member.familyId || 'Not assigned to a family'}</Field>
        </div>

        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900">Family Members</h4>
          {family.length > 0 ? (
            <div className="space-y-3">
              {family.map((relative) => (
                <div
                  key={relative.id}
                  className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    {relative.avatar ? (
                      <AvatarImage
                        src={relative.avatar}
                        alt={relative.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-gray-600">{initials(relative.name)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{relative.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{relative.relationshipType}</p>
                  </div>
                  <span
                    className={`${pillClass} ${relative.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                  >
                    {relative.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No family members found</p>
          )}
        </div>
      </div>
    </div>
  );
}
