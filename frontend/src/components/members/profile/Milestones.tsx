import type { MemberDetails } from '../../../types/domain';
import { formatDate, impactClass, milestoneIcon } from '../../../lib/members/profile';
import { EmptyTab, SectionHeader, pillClass } from './Field';

/** The "Milestones" tab: baptism, confirmation, first volunteering and the like. */
export default function Milestones({ member }: { member: MemberDetails }) {
  const milestones = member.milestones ?? [];
  return (
    <div className="space-y-6">
      <SectionHeader title="Member Milestones" count={`${milestones.length} milestones`} />
      {milestones.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {milestones.map((milestone) => (
            <div key={milestone.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-2xl">{milestoneIcon(milestone.milestoneType)}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">{milestone.title}</h4>
                    <span className="text-xs text-gray-500">
                      {formatDate(milestone.achievedDate)}
                    </span>
                  </div>
                  {milestone.description && (
                    <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                  )}
                  <div className="flex items-center space-x-2 mt-2">
                    <span className={`${pillClass} ${impactClass(milestone.impact)}`}>
                      {milestone.impact} impact
                    </span>
                    <span className="text-xs text-gray-500 capitalize">{milestone.category}</span>
                    {milestone.celebrated && (
                      <span className={`${pillClass} bg-green-100 text-green-800`}>Celebrated</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyTab>No milestones found</EmptyTab>
      )}
    </div>
  );
}
