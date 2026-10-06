import type { MemberDetails } from '@/types/domain';
import EngagementComponents from '@/components/analytics/EngagementComponents';
import { riskLabel, stageLabel } from '@/lib/members/display';
import { formatDate, formatDay, formatDayOrDate, membershipDuration } from '@/lib/members/profile';
import { Field } from './Field';

/** The "Church Info" tab: membership, background and engagement analytics. */
export default function ChurchInfo({ member }: { member: MemberDetails }) {
  const engagement = member.engagement;
  return (
    <div className="space-y-8">
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
        </div>
      </div>

      {engagement && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Engagement Analytics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Overall Score">{Math.round(engagement.engagementScore)}/100</Field>
            <Field label="Membership Stage">{stageLabel(engagement.membershipStage)}</Field>
            <Field label="Risk Level">{riskLabel(engagement.riskLevel)}</Field>
            <Field label="Last Activity">{formatDayOrDate(engagement.lastActivity)}</Field>
          </div>
          <EngagementComponents title="Score components" headingLevel="h3" scores={engagement} />
        </div>
      )}
    </div>
  );
}
