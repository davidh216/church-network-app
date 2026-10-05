import type { Member } from '../../types/domain';
import {
  engagementClass,
  formatStage,
  initials,
  riskDotClass,
  stageClass,
} from '../../lib/members/display';

const pill = 'inline-flex items-center rounded-full text-xs font-medium';

/** The member's avatar image, or their initials in a grey circle. */
export function MemberAvatar({ member, size }: { member: Member; size: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  return (
    <div className={`${box} bg-gray-300 rounded-full flex items-center justify-center shrink-0`}>
      {member.avatar ? (
        <img src={member.avatar} alt={member.name} className={`${box} rounded-full object-cover`} />
      ) : (
        <span
          className={size === 'sm' ? 'text-sm font-medium text-gray-600' : 'text-lg text-gray-600'}
        >
          {initials(member.name)}
        </span>
      )}
    </div>
  );
}

/** One badge per role, or a grey "member" badge when the user has none. */
export function RoleBadges({
  member,
  padding = 'px-2.5 py-0.5',
}: {
  member: Member;
  padding?: string;
}) {
  if (!member.roles || member.roles.length === 0) {
    return <span className={`${pill} ${padding} bg-gray-100 text-gray-800`}>member</span>;
  }
  return (
    <>
      {member.roles.map((userRole) => (
        <span key={userRole.role.id} className={`${pill} ${padding} bg-blue-100 text-blue-800`}>
          {userRole.role.name}
        </span>
      ))}
    </>
  );
}

/** Active (green) or Inactive (red). */
export function StatusBadge({
  isActive,
  padding = 'px-2.5 py-0.5',
}: {
  isActive: boolean;
  padding?: string;
}) {
  return (
    <span
      className={`${pill} ${padding} ${isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

/** The membership stage badge, or "Unknown". */
export function StageBadge({ member }: { member: Member }) {
  const stage = member.engagement?.membershipStage;
  if (!stage) return <span className="text-sm text-gray-400">Unknown</span>;
  return <span className={`${pill} px-2 py-1 ${stageClass(stage)}`}>{formatStage(stage)}</span>;
}

/** The engagement score with a risk-level dot, or "-". */
export function EngagementBadge({ member }: { member: Member }) {
  const engagement = member.engagement;
  if (!engagement) return <span className="text-sm text-gray-400">-</span>;
  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${engagementClass(engagement.engagementScore)}`}
      >
        {engagement.engagementScore}%
      </div>
      <div
        className={`w-2 h-2 rounded-full ${riskDotClass(engagement.riskLevel)}`}
        title={`${engagement.riskLevel} risk`}
      ></div>
    </div>
  );
}
