import Link from 'next/link';
import type { MemberDetails } from '../../../types/domain';
import { formatStage, initials } from '../../../lib/members/display';
import { calculateAge, formatDate, riskBadgeClass } from '../../../lib/members/profile';

export const backLinkClass = 'text-sm font-medium text-blue-600 hover:text-blue-800';

const badge = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

/** Avatar, name, status, age, risk, roles and stage, with Edit Member and the back link. */
export default function ProfileHeader({
  member,
  onEdit,
}: {
  member: MemberDetails;
  onEdit: () => void;
}) {
  return (
    <div className="flex justify-between items-start border-b border-gray-200 pb-4 mb-6">
      <div className="flex items-center space-x-4">
        <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center">
          {member.avatar ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <span className="text-2xl text-gray-600">{initials(member.name)}</span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{member.name}</h1>
          <div className="flex items-center space-x-4 mt-1">
            <span
              className={`${badge} ${member.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
            >
              {member.isActive ? 'Active' : 'Inactive'}
            </span>
            <span className="text-sm text-gray-500">
              Member since {formatDate(member.membershipDate)}
            </span>
            {member.dateOfBirth && (
              <span className="text-sm text-gray-500">Age {calculateAge(member.dateOfBirth)}</span>
            )}
            {member.engagement && (
              <span className={`${badge} ${riskBadgeClass(member.engagement.riskLevel)}`}>
                {member.engagement.riskLevel} risk
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {member.roles.map((userRole) => (
              <span key={userRole.role.id} className={`${badge} bg-blue-100 text-blue-800`}>
                {userRole.role.name}
              </span>
            ))}
            {member.engagement && (
              <span className={`${badge} bg-purple-100 text-purple-800`}>
                {formatStage(member.engagement.membershipStage)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={onEdit}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Edit Member
        </button>
        <Link href="/members" className={backLinkClass}>
          ← Back to members
        </Link>
      </div>
    </div>
  );
}
