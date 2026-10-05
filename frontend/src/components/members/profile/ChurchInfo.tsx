import type { MemberDetails } from '@/types/domain';
import { formatDate, formatDay, membershipDuration } from '@/lib/members/profile';
import { Field } from './Field';

/** The "Church Info" tab: membership, background and engagement analytics. */
export default function ChurchInfo({ member }: { member: MemberDetails }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Membership Information</h2>
        <Field label="Membership Type" className="text-sm text-gray-900 capitalize">
          {member.membershipType || 'Not specified'}
        </Field>
        <div>
          <Field label="Membership Date">{formatDate(member.membershipDate)}</Field>
          <p className="text-xs text-gray-500">
            Duration: {membershipDuration(member.membershipDate)}
          </p>
        </div>
        <Field label="Baptism Date">{formatDate(member.baptismDate)}</Field>
        <Field label="Confirmation Date">{formatDate(member.confirmationDate)}</Field>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Background</h2>
        <Field label="Previous Church">{member.previousChurch || 'Not specified'}</Field>
        <Field label="How Did You Hear About Us?">
          {member.howHeardAboutUs || 'Not specified'}
        </Field>
        <Field label="Last Attended">{formatDay(member.lastAttended)}</Field>
        {member.engagement && (
          <div className="mt-6">
            <h2 className="text-lg font-medium text-gray-900">Engagement Analytics</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Overall Score">
                {member.engagement.engagementScore.toFixed(1)}/100
              </Field>
              <Field label="Last Activity">{formatDate(member.engagement.lastActivity)}</Field>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
