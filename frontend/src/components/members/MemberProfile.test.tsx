import { fireEvent, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TIMELINE_PAGE } from '@embrace/shared';
import MemberProfile from '@/components/members/MemberProfile';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';
import type { MemberDetails } from '@/types/domain';

const detailsApi = vi.hoisted(() => ({ getMemberDetails: vi.fn(), getMemberTimeline: vi.fn() }));
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
  volunteerSkills: ['Music'],
  interests: [],
  createdAt: '2024-01-05T12:00:00.000Z',
  updatedAt: '2024-01-06T12:00:00.000Z',
  roles: [{ role: { id: 'r1', name: 'leader' } }],
  engagement: {
    engagementScore: 72,
    membershipStage: 'core_member',
    riskLevel: 'medium',
    attendanceScore: 0,
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
  memberNotes: [],
} as unknown as MemberDetails;

beforeEach(() => {
  vi.resetAllMocks();
  rolesApi.listRoles.mockResolvedValue([]);
  detailsApi.getMemberTimeline.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});

describe('MemberProfile', () => {
  it('renders the header and the Personal Info tab first', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByText('medium risk')).toBeTruthy();
    expect(screen.getByText('Core Member')).toBeTruthy();
    // Tab sections sit directly under the member's h1.
    expect(screen.getByRole('heading', { level: 2, name: 'Basic Information' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Back to members' }).getAttribute('href')).toBe(
      '/members',
    );
  });

  it('leaves out "Member since" without a membership date instead of "Not set"', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Member since/)).toBeNull();
  });

  it('shows "Member since" with the real membership date', async () => {
    detailsApi.getMemberDetails.mockResolvedValue({
      ...details,
      membershipDate: '2019-04-02T12:00:00.000Z',
    });
    await render(<MemberProfile memberId="u1" />);
    const expected = new Date('2019-04-02T12:00:00.000Z').toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(await screen.findByText(`Member since ${expected}`)).toBeTruthy();
  });

  it('switches tabs and shows each panel with its empty states', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('tab', { name: /Family/ }));
    expect(screen.getByText('1 family members')).toBeTruthy();
    expect(screen.getByText('Byron Lovelace')).toBeTruthy();
    expect(screen.getByText('Head of Family')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Timeline/ }));
    expect(await screen.findByText('No timeline activities found')).toBeTruthy();
    expect(detailsApi.getMemberTimeline).toHaveBeenCalledWith(
      'u1',
      { page: 1, pageSize: 20 },
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('tab', { name: /Interactions/ }));
    expect(screen.getByText('No interactions found')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Milestones/ }));
    expect(screen.getByText('No milestones found')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Activity & Notes/ }));
    expect(screen.getByText('Music')).toBeTruthy();
    expect(screen.getByText('No interests listed')).toBeTruthy();
    expect(screen.getByText('u1')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Church Info/ }));
    expect(screen.getByText('72.0/100')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Contact & Address/ }));
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    // Opt-in state is in the text, not only in the dot colour.
    expect(screen.getByText('Email Communications')).toHaveTextContent(
      'Email Communications: Opted in',
    );
    expect(screen.getByText('SMS/Text Messages')).toHaveTextContent('SMS/Text Messages: Opted out');
  });

  it('shows the computed timeline from its own endpoint and pages through it', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    detailsApi.getMemberTimeline.mockImplementation((_id: string, params: { page: number }) =>
      Promise.resolve({
        items:
          params.page === 1
            ? [
                {
                  kind: 'milestone',
                  id: 'm1',
                  date: '2026-04-05T12:00:00.000Z',
                  title: 'Baptised',
                  summary: 'Easter service',
                },
                {
                  kind: 'attendance',
                  id: 'a1',
                  date: '2026-01-04T12:00:00.000Z',
                  title: 'Attended sunday service',
                  summary: null,
                },
              ]
            : [
                {
                  kind: 'note',
                  id: 'n1',
                  date: '2025-12-01T12:00:00.000Z',
                  title: 'General',
                  summary: 'Older note',
                },
              ],
        total: 21,
        page: params.page,
        pageSize: 20,
      }),
    );
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('tab', { name: /Timeline/ }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Baptised' })).toBeTruthy();
    expect(screen.getByText('Easter service')).toBeTruthy();
    expect(screen.getByText('Milestone')).toBeTruthy();
    expect(screen.getByText('Attendance')).toBeTruthy();
    expect(screen.getByText('21 activities')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Older note')).toBeTruthy();
    expect(detailsApi.getMemberTimeline).toHaveBeenLastCalledWith(
      'u1',
      { page: 2, pageSize: 20 },
      expect.anything(),
    );
  });

  it('stops Next at the last page the API accepts, not at the end of the total', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    detailsApi.getMemberTimeline.mockImplementation((_id: string, params: { page: number }) =>
      Promise.resolve({
        items: [
          {
            kind: 'note',
            id: `n${params.page}`,
            date: '2025-12-01T12:00:00.000Z',
            dateOnly: false,
            title: 'General',
            summary: `Page ${params.page} note`,
          },
        ],
        total: MAX_TIMELINE_PAGE * 20 + 1,
        page: params.page,
        pageSize: 20,
      }),
    );
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('tab', { name: /Timeline/ }));
    await screen.findByText('Page 1 note');

    for (let page = 2; page <= MAX_TIMELINE_PAGE; page += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText(`Page ${page} note`);
    }
    expect(screen.getByText(`${MAX_TIMELINE_PAGE * 20 + 1} activities`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    const pages = detailsApi.getMemberTimeline.mock.calls.map(([, params]) => params.page);
    expect(Math.max(...pages)).toBe(MAX_TIMELINE_PAGE);
  });

  it('shows a timeline error with a retry', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    detailsApi.getMemberTimeline.mockRejectedValue(new ApiError(500, 'Timeline exploded'));
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('tab', { name: /Timeline/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Timeline exploded');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('follows the ARIA tabs pattern: one tab stop, arrow keys, Home and End', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });
    const personal = screen.getByRole('tab', { name: /Personal Info/ });
    expect(personal).toHaveAttribute('aria-selected', 'true');
    expect(personal).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Church Info/ })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: /Personal Info/ })).toBeInTheDocument();

    fireEvent.keyDown(personal, { key: 'ArrowRight' });
    const church = screen.getByRole('tab', { name: /Church Info/ });
    expect(church).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(church);
    expect(screen.getByRole('tabpanel', { name: /Church Info/ })).toBeInTheDocument();

    fireEvent.keyDown(church, { key: 'End' });
    expect(screen.getByRole('tab', { name: /Activity & Notes/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' }); // wraps to the first
    expect(personal).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(personal, { key: 'ArrowLeft' }); // and back to the last
    expect(screen.getByRole('tab', { name: /Activity & Notes/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(personal).toHaveAttribute('aria-selected', 'true');
  });

  it('opens Edit Member as a labelled modal dialog', async () => {
    detailsApi.getMemberDetails.mockResolvedValue(details);
    await render(<MemberProfile memberId="u1" />);
    const edit = await screen.findByRole('button', { name: 'Edit Member' });
    edit.focus();
    fireEvent.click(edit);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Member' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(edit);
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

  it('offers no Retry when the member does not exist', async () => {
    detailsApi.getMemberDetails.mockRejectedValue(new ApiError(404, 'Member not found'));
    await render(<MemberProfile memberId="missing" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Member not found');
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.getByRole('link', { name: '← Back to members' })).toBeTruthy();
  });
});

// Calendar dates arrive as UTC midnight; a viewer west of UTC must still see the same day.
describe('MemberProfile calendar dates west of UTC', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Chicago';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('runs in a time zone where UTC midnight is the previous local day', () => {
    expect(new Date('2026-01-04T00:00:00.000Z').getDate()).toBe(3);
  });

  it('shows date-only timeline items, milestones and last attended on their own day', async () => {
    detailsApi.getMemberDetails.mockResolvedValue({
      ...details,
      lastAttended: '2026-01-04T00:00:00.000Z',
      milestones: [
        {
          id: 'm1',
          milestoneType: 'baptism',
          title: 'Baptised',
          achievedDate: '2026-04-05T00:00:00.000Z',
          impact: 'high',
        },
      ],
    });
    detailsApi.getMemberTimeline.mockResolvedValue({
      items: [
        {
          kind: 'attendance',
          id: 'a1',
          date: '2026-01-04T00:00:00.000Z',
          dateOnly: true,
          title: 'Attended sunday service',
          summary: null,
        },
        {
          kind: 'interaction',
          id: 'i1',
          date: '2026-01-02T03:00:00.000Z',
          dateOnly: false,
          title: 'Late call',
          summary: null,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    await render(<MemberProfile memberId="u1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('tab', { name: /Timeline/ }));
    expect(await screen.findByText('January 4, 2026')).toBeTruthy();
    // A real timestamp still shows the viewer's local day (9 pm on January 1 in Chicago).
    expect(screen.getByText('January 1, 2026')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Milestones/ }));
    expect(screen.getByText('April 5, 2026')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Church Info/ }));
    expect(screen.getByText('January 4, 2026')).toBeTruthy();
  });
});
