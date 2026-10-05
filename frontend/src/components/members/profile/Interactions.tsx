import type { MemberDetails } from '@/types/domain';
import { formatDateTime, interactionIcon, priorityClass } from '@/lib/members/profile';
import { stageLabel } from '@/lib/members/display';
import { EmptyTab, SectionHeader, pillClass } from './Field';

/** The "Interactions" tab: emails, texts, calls and visits logged for the member. */
export default function Interactions({ member }: { member: MemberDetails }) {
  const interactions = member.interactions ?? [];
  return (
    <div className="space-y-6">
      <SectionHeader title="Member Interactions" count={`${interactions.length} interactions`} />
      {interactions.length > 0 ? (
        <div className="space-y-4">
          {interactions.map((interaction) => (
            <div key={interaction.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{interactionIcon(interaction.interactionType)}</div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      {interaction.subject || stageLabel(interaction.interactionType)}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {interaction.channel} • {formatDateTime(interaction.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`${pillClass} ${priorityClass(interaction.priority)}`}>
                    {interaction.priority}
                  </span>
                  {interaction.responseRequired && (
                    <span className={`${pillClass} bg-yellow-100 text-yellow-800`}>
                      Response needed
                    </span>
                  )}
                </div>
              </div>
              {interaction.content && (
                <p className="text-sm text-gray-600 mt-2">{interaction.content}</p>
              )}
              {interaction.category && (
                <div className="mt-2">
                  <span className="text-xs text-gray-500 capitalize">{interaction.category}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyTab>No interactions found</EmptyTab>
      )}
    </div>
  );
}
