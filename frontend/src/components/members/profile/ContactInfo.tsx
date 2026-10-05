import type { MemberDetails } from '@/types/domain';
import { Field } from './Field';

/** A channel with a green (opted in) or red (opted out) dot; the state is also in the text. */
function OptIn({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center">
      <span
        aria-hidden="true"
        className={`w-3 h-3 rounded-full mr-3 ${on ? 'bg-green-500' : 'bg-red-500'}`}
      />
      <span className="text-sm text-gray-700">
        {label}
        <span className="sr-only">: {on ? 'Opted in' : 'Opted out'}</span>
      </span>
    </div>
  );
}

/** The "Contact & Address" tab: email, phone, communication preferences and address. */
export default function ContactInfo({ member }: { member: MemberDetails }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Contact Information</h2>
        <Field label="Email">{member.email}</Field>
        <Field label="Phone">{member.phone || 'Not provided'}</Field>
        <div className="mt-6">
          <h2 className="text-lg font-medium text-gray-900">Communication Preferences</h2>
          <div className="space-y-2 mt-2">
            <OptIn on={member.emailOptIn} label="Email Communications" />
            <OptIn on={member.smsOptIn} label="SMS/Text Messages" />
            <OptIn on={member.mailOptIn} label="Physical Mail" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Address</h2>
        <Field label="Street Address">{member.address || 'Not provided'}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="City">{member.city || 'Not provided'}</Field>
          <Field label="State">{member.state || 'Not provided'}</Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ZIP Code">{member.zipCode || 'Not provided'}</Field>
          <Field label="Country">{member.country || 'Not provided'}</Field>
        </div>
      </div>
    </div>
  );
}
