import Link from 'next/link';
import type { Member } from '../../types/domain';

interface MemberRowActionsProps {
  member: Member;
  onEdit: (member: Member) => void;
  /** Cards use slightly larger text than the table. */
  variant?: 'table' | 'card';
}

/** Staff actions for one member: "View" links to the profile, "Edit" opens the form. */
export default function MemberRowActions({
  member,
  onEdit,
  variant = 'table',
}: MemberRowActionsProps) {
  const size = variant === 'card' ? ' text-sm font-medium' : '';
  return (
    <div className="flex space-x-2">
      <Link
        href={`/members/${encodeURIComponent(member.id)}`}
        className={`text-green-700 hover:text-green-900${size}`}
        title="View Profile"
      >
        View
      </Link>
      <button
        type="button"
        onClick={() => onEdit(member)}
        className={`text-blue-600 hover:text-blue-900${size}`}
        title="Edit Member"
      >
        Edit
      </button>
    </div>
  );
}
