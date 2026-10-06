import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OwnAttendance from '@/components/members/OwnAttendance';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';

const detailsApi = vi.hoisted(() => ({ getOwnAttendance: vi.fn() }));
vi.mock('@/lib/api/memberDetails', () => detailsApi);

const summary = {
  months: 12,
  from: '2025-10-06',
  to: '2026-10-05',
  types: ['sunday_service'],
  serviceCount: 2,
  attendedCount: 2,
  attended: [
    { id: 's2', date: '2026-10-04', type: 'sunday_service', title: 'Harvest' },
    { id: 's1', date: '2026-09-27', type: 'sunday_service', title: null },
  ],
};

beforeEach(() => vi.resetAllMocks());

describe('OwnAttendance', () => {
  it("shows the member's own summary and the services they attended", async () => {
    detailsApi.getOwnAttendance.mockResolvedValue(summary);
    await render(<OwnAttendance />);
    expect(screen.getByRole('heading', { level: 2, name: 'Your Attendance' })).toBeTruthy();
    expect(await screen.findByText(/You attended/)).toHaveTextContent(
      /You attended 2 of 2 Sunday Service services .*\(100%\)/,
    );
    expect(screen.getByText(/You attended/)).toHaveTextContent(
      /between October 6, 2025 and October 5, 2026/,
    );
    // Calendar days, not the evening before (tests run in Los Angeles).
    const items = within(screen.getByRole('list', { name: 'Services attended' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual([
      'October 4, 2026 · HarvestSunday Service',
      'September 27, 2026Sunday Service',
    ]);
    expect(detailsApi.getOwnAttendance).toHaveBeenCalledWith({}, expect.anything());
  });

  it('shows an error with Retry', async () => {
    detailsApi.getOwnAttendance.mockRejectedValueOnce(new ApiError(500, 'Boom'));
    detailsApi.getOwnAttendance.mockResolvedValue({ ...summary, attended: [], attendedCount: 0 });
    await render(<OwnAttendance />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No services attended in this period')).toBeTruthy();
  });
});
