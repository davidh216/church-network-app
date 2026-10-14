import Link from 'next/link';
import type { MemberDetails } from '@/types/domain';
import { addressText, relationshipLabel } from '@/lib/families/display';
import { initials } from '@/lib/members/display';
import { Field, SectionHeader, pillClass } from './Field';
import AvatarImage from '@/components/ui/AvatarImage';

const linkClass = 'font-medium text-blue-700 hover:text-blue-900 hover:underline';

/**
 * The "Family" tab: the member's family (name, address, their role in it) and their relatives
 * with active relationships in that family, each linked to their profile. The profile is the
 * staff view (members see OwnProfile), so it always offers the family's page to manage it.
 */
export default function Family({ member }: { member: MemberDetails }) {
  const family = member.family ?? null;
  const relatives = member.familyMembers ?? [];
  const familyHref = family ? `/families/${encodeURIComponent(family.id)}` : null;
  return (
    <div className="space-y-6">
      <SectionHeader title="Family Information" count={`${relatives.length} family members`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-base font-medium text-gray-900">Family Status</h3>
          <Field label="Family">
            {family && familyHref ? (
              <Link href={familyHref} className={linkClass}>
                {family.familyName}
              </Link>
            ) : (
              'Not assigned to a family'
            )}
          </Field>
          {family && (
            <>
              <Field label="Family Role">
                {member.isHeadOfFamily ? 'Head of Family' : 'Family Member'}
              </Field>
              <Field label="Family Address">{addressText(family) ?? 'Not recorded'}</Field>
            </>
          )}
          <Link
            href={familyHref ?? '/families'}
            className="inline-block px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            {family ? 'Manage family' : 'Find or create a family'}
          </Link>
        </div>

        <div className="space-y-4">
          <h3 className="text-base font-medium text-gray-900">Family Members</h3>
          {relatives.length > 0 ? (
            <ul className="space-y-3">
              {relatives.map((relative) => (
                <li
                  key={relative.id}
                  className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    {relative.avatar ? (
                      <AvatarImage
                        src={relative.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <span aria-hidden="true" className="text-xs text-gray-600">
                        {initials(relative)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <Link
                      href={`/members/${encodeURIComponent(relative.id)}`}
                      className={`text-sm ${linkClass}`}
                    >
                      {relative.name}
                    </Link>
                    <p className="text-xs text-gray-600">
                      {relationshipLabel(relative.relationshipType)}
                    </p>
                  </div>
                  <span
                    className={`${pillClass} ${relative.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                  >
                    {relative.isActive ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">No relationships recorded</p>
          )}
        </div>
      </div>
    </div>
  );
}
