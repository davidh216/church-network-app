import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberProfile from '@/components/members/MemberProfile';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';
import type { MemberDetails } from '@/types/domain';

const detailsApi = vi.hoisted(() => ({ getMemberDetails: vi.fn() }));
vi.mock('@/lib/api/memberDetails', () => detailsApi);

const rolesApi = vi.hoisted(() => ({ listRoles: vi.fn() }));
vi.mock('@/lib/api/roles', () => rolesApi);

const details = {
  id: 'u1',
  name: 'Ada Lovelace',
  firstName: 'Ada',
  email: 'ada@example.com',
  isActive: true,
  emailOptIn: true,
  smsOptIn: false,
  mailOptIn: false,
  isHeadOfFamily: true,
  volunteerSkills: '["Music"]',
  interests: 'not json',
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-01-06T12:00:00.000Z',
  roles: [{ role: { id: 'r1', name: 'leader' } }],
  engagement: {
    engagementScore: 72,
    membershipStage: 'core_member',
    riskLevel: 'medium',
    attendanceScore: 0,
    givingScore: 0,
    volunteerScore: 0,
    communityScore: 0,
    communicationScore: 0,
  },
  familyMembers: [
    {
      id: 'f1',
      name: 'Byron Lovelace',
      isActive: false,
      relationshipType: 'parent',
      isPrimary: false,
    },
  ],
  interactions: [],
  milestones: [],
  timelineActivities: [],
  memberNotes: [],
} as unknown as MemberDetails;

beforeEach(() => {
  vi.resetAllMocks();
  rolesApi.listRoles.mockResolvedValue([]);
});

describe('MemberProfile', () => {
  it('renders the header and the Personal Info tab first', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByText('medium risk')).toBeTruthy();
    expect(screen.getByText('core member')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Basic Information' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to members' }).getAttribute('href')).toBe(
      '/members',
    );
  });

  it('switches tabs and shows each panel with its empty states', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: /Family/ }));
    expect(screen.getByText('1 family members')).toBeTruthy();
    expect(screen.getByText('Byron Lovelace')).toBeTruthy();
    expect(screen.getByText('Head of Family')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Timeline/ }));
    expect(screen.getByText('No timeline activities found')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Interactions/ }));
    expect(screen.getByText('No interactions found')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Milestones/ }));
    expect(screen.getByText('No milestones found')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Activity & Notes/ }));
    expect(screen.getByText('Music')).toBeTruthy();
    expect(screen.getByText('No interests listed')).toBeTruthy();
    expect(screen.getByText('u1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Church Info/ }));
    expect(screen.getByText('72.0/100')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Contact & Address/ }));
    expect(screen.getByText('ada@example.com')).toBeTruthy();
  });

  it('opens the member form in place from Edit Member', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Member' }));
    expect(await screen.findByDisplayValue('ada@example.com')).toBeTruthy();
  });

  it('shows the error with Retry and a link back to the list', async () => {
    detailsApi.getMemberDetails.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Boom'));
    await render(<MemberProfile memberId="u1" />);
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to members' })).toBeTruthy();
  });
});
