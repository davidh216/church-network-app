import type { UserSortField } from '@embrace/shared';
import type { MemberSort } from '@/lib/members/filters';
import { formatLocalDate } from '@/lib/format/date';
import type { Member } from '@/types/domain';
import { EngagementBadge, MemberAvatar, RoleBadges, StageBadge, StatusBadge } from './MemberBadges';
import MemberRowActions from './MemberRowActions';
import SortableHeader from './SortableHeader';

interface MemberTableProps {
  members: Member[];
  /** Staff see contact, engagement, stage, status, selection and actions. */
  canManage: boolean;
  sort: MemberSort | null;
  onSort: (field: UserSortField) => void;
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (member: Member) => void;
}

const thClass = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
const tdClass = 'px-6 py-4 whitespace-nowrap';
const checkboxClass = 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-sm';

/** The member list's table view (one page of members). */
export default function MemberTable({
  members,
  canManage,
  sort,
  onSort,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
}: MemberTableProps) {
  const allOnPage = members.length > 0 && members.every((m) => selected.has(m.id));
  const someOnPage = !allOnPage && members.some((m) => selected.has(m.id));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {canManage && (
              <th scope="col" className="px-6 py-3 w-12">
                <input
                  type="checkbox"
                  aria-label="Select all members on this page"
                  checked={allOnPage}
                  // Mixed when only some rows on this page are selected.
                  ref={(el) => {
                    if (el) el.indeterminate = someOnPage;
                  }}
                  onChange={onToggleSelectAll}
                  className={checkboxClass}
                />
              </th>
            )}
            <SortableHeader label="Member" field="name" sort={sort} onSort={onSort} />
            {canManage && (
              <SortableHeader label="Contact" field="email" sort={sort} onSort={onSort} />
            )}
            <th scope="col" className={thClass}>
              Role
            </th>
            {canManage && (
              <>
                <SortableHeader
                  label="Engagement"
                  field="engagementScore"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableHeader label="Stage" field="membershipStage" sort={sort} onSort={onSort} />
                <th scope="col" className={thClass}>
                  Status
                </th>
              </>
            )}
            <SortableHeader
              label="Joined"
              field="createdAt"
              sort={sort}
              onSort={onSort}
              sortable={canManage}
            />
            {canManage && (
              <th scope="col" className={thClass}>
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {members.map((member) => (
            <tr
              key={member.id}
              className={`hover:bg-gray-50 ${selected.has(member.id) ? 'bg-blue-50' : ''}`}
            >
              {canManage && (
                <td className={tdClass}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${member.name}`}
                    checked={selected.has(member.id)}
                    onChange={() => onToggleSelect(member.id)}
                    className={checkboxClass}
                  />
                </td>
              )}
              <td className={tdClass}>
                <div className="flex items-center space-x-3">
                  <MemberAvatar member={member} size="sm" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{member.name}</div>
                    {member.bio && (
                      <div className="text-sm text-gray-500 truncate max-w-xs">{member.bio}</div>
                    )}
                  </div>
                </div>
              </td>
              {canManage && (
                <td className={tdClass}>
                  <div className="text-sm text-gray-900">{member.email}</div>
                  {member.phone && <div className="text-sm text-gray-500">{member.phone}</div>}
                  {member.lastLoginAt && (
                    <div className="text-xs text-gray-500">
                      Last login: {formatLocalDate(member.lastLoginAt)}
                    </div>
                  )}
                </td>
              )}
              <td className={tdClass}>
                <div className="flex flex-wrap gap-1">
                  <RoleBadges member={member} />
                </div>
              </td>
              {canManage && (
                <>
                  <td className={tdClass}>
                    <EngagementBadge member={member} />
                  </td>
                  <td className={tdClass}>
                    <StageBadge member={member} />
                  </td>
                  <td className={tdClass}>
                    <StatusBadge isActive={member.isActive} />
                  </td>
                </>
              )}
              <td className={`${tdClass} text-sm text-gray-500`}>
                <div>{formatLocalDate(member.createdAt)}</div>
                {member.membershipDate && member.membershipDate !== member.createdAt && (
                  <div className="text-xs text-gray-500">
                    Member: {formatLocalDate(member.membershipDate)}
                  </div>
                )}
              </td>
              {canManage && (
                <td className={`${tdClass} text-sm font-medium`}>
                  <MemberRowActions member={member} onEdit={onEdit} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
