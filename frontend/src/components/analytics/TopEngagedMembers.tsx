import type { MemberAnalytics } from '@/types/domain';
import { engagementScoreClass } from '@/lib/analytics/display';
import { initials, stageClass, stageLabel } from '@/lib/members/display';
import AvatarImage from '@/components/ui/AvatarImage';

const SHOWN = 8;

/** The "Most Engaged Members" ranking (top eight). */
export default function TopEngagedMembers({
  members,
}: {
  members: MemberAnalytics['topEngagedMembers'];
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-xs">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Most Engaged Members</h3>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {members.slice(0, SHOWN).map((member, index) => (
            <div
              key={member.user.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-4">
                <div className="shrink-0">
                  <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                </div>
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                  {member.user.avatar ? (
                    <AvatarImage
                      src={member.user.avatar}
                      alt={member.user.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-600">
                      {initials(member.user)}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{member.user.name}</p>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${stageClass(member.membershipStage)}`}
                  >
                    {stageLabel(member.membershipStage)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${engagementScoreClass(member.engagementScore)}`}
                >
                  {member.engagementScore}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
