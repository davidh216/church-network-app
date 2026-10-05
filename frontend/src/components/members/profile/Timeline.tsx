import type { MemberDetails } from '@/types/domain';
import { formatDate, impactClass } from '@/lib/members/profile';
import { EmptyTab, SectionHeader, pillClass } from './Field';

/** The "Timeline" tab: the member's timeline activities, newest as the API orders them. */
export default function Timeline({ member }: { member: MemberDetails }) {
  const activities = member.timelineActivities ?? [];
  return (
    <div className="space-y-6">
      <SectionHeader title="Member Timeline" count={`${activities.length} activities`} />
      {activities.length > 0 ? (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
              <div className="shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">
                    {activity.activityType.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900">{activity.title}</h4>
                  <span className="text-xs text-gray-500">{formatDate(activity.activityDate)}</span>
                </div>
                {activity.description && (
                  <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
                )}
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`${pillClass} ${impactClass(activity.impact)}`}>
                    {activity.impact} impact
                  </span>
                  <span className="text-xs text-gray-500 capitalize">{activity.category}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyTab>No timeline activities found</EmptyTab>
      )}
    </div>
  );
}
