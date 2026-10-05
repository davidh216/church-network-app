'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import AddEditMemberModal from './AddEditMemberModal';
import { useMemberDetails } from '../../lib/queries/memberDetails';
import InlineError from '../ui/InlineError';
import Skeleton from '../ui/Skeleton';
import type { MemberDetails } from '../../types/domain';
import ChurchInfo from './profile/ChurchInfo';
import ContactInfo from './profile/ContactInfo';
import Family from './profile/Family';
import Interactions from './profile/Interactions';
import Milestones from './profile/Milestones';
import Notes from './profile/Notes';
import PersonalInfo from './profile/PersonalInfo';
import ProfileHeader, { backLinkClass } from './profile/ProfileHeader';
import Tabs, { panelId, tabId, type ProfileTabId } from './profile/Tabs';
import Timeline from './profile/Timeline';

interface MemberProfileProps {
  memberId: string;
}

const TAB_PANELS: Record<ProfileTabId, ComponentType<{ member: MemberDetails }>> = {
  personal: PersonalInfo,
  church: ChurchInfo,
  contact: ContactInfo,
  timeline: Timeline,
  family: Family,
  interactions: Interactions,
  milestones: Milestones,
  activity: Notes,
};

const cardClass = 'p-5 border border-gray-200 shadow rounded-md bg-white';

/** Staff view of one member at `/members/[id]`, with Edit opening the member form in place. */
export default function MemberProfile({ memberId }: MemberProfileProps) {
  const { data: member, isPending, error, refetch } = useMemberDetails(memberId);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTabId>('personal');

  if (isPending) {
    return (
      <div className={cardClass}>
        <Skeleton rows={6} label="Loading member details" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className={`${cardClass} space-y-4`}>
        <InlineError
          error={error}
          fallback="Member not found"
          onRetry={error ? () => void refetch() : undefined}
        />
        <Link href="/members" className={backLinkClass}>
          ← Back to members
        </Link>
      </div>
    );
  }

  const Panel = TAB_PANELS[activeTab];
  return (
    <div>
      <div className={cardClass}>
        <ProfileHeader member={member} onEdit={() => setEditing(true)} />
        <Tabs active={activeTab} onChange={setActiveTab} />
        <div
          role="tabpanel"
          id={panelId(activeTab)}
          aria-labelledby={tabId(activeTab)}
          tabIndex={0}
          className="space-y-6"
        >
          <Panel member={member} />
        </div>
      </div>
      <AddEditMemberModal isOpen={editing} onClose={() => setEditing(false)} member={member} />
    </div>
  );
}
