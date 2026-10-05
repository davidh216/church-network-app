import { formatLocalDate } from '@/lib/format/date';
import type { Member } from '@/types/domain';
import { MemberAvatar, RoleBadges, StatusBadge } from './MemberBadges';
import MemberRowActions from './MemberRowActions';

interface MemberCardsProps {
  members: Member[];
  canManage: boolean;
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (member: Member) => void;
}

/** The member list's card view (one page of members). */
export default function MemberCards({
  members,
  canManage,
  selected,
  onToggleSelect,
  onEdit,
}: MemberCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {members.map((member) => (
        <div
          key={member.id}
          className={`bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow relative ${
            selected.has(member.id) ? 'ring-2 ring-blue-500 border-blue-300' : ''
          }`}
        >
          {canManage && (
            <div className="absolute top-4 right-4">
              <input
                type="checkbox"
                aria-label={`Select ${member.name}`}
                checked={selected.has(member.id)}
                onChange={() => onToggleSelect(member.id)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-sm"
              />
            </div>
          )}

          <div className="flex items-start space-x-4">
            <MemberAvatar member={member} size="md" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-medium text-gray-900 truncate">{member.name}</h2>
              {member.email && <p className="text-sm text-gray-500 truncate">{member.email}</p>}
              {member.phone && <p className="text-sm text-gray-500">{member.phone}</p>}

              <div className="flex flex-wrap gap-1 mt-2">
                <RoleBadges member={member} padding="px-2 py-1" />
                {canManage && <StatusBadge isActive={member.isActive} padding="px-2 py-1" />}
              </div>

              {member.bio && (
                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{member.bio}</p>
              )}

              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-gray-500">
                  Joined {formatLocalDate(member.createdAt)}
                </span>
                {canManage && <MemberRowActions member={member} onEdit={onEdit} variant="card" />}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
