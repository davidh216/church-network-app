import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceSheet from '@/components/services/AttendanceSheet';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';

const servicesApi = vi.hoisted(() => ({
  getServiceAttendance: vi.fn(),
  saveServiceAttendance: vi.fn(),
}));
vi.mock('@/lib/api/services', () => servicesApi);

const service = {
  id: 's1',
  date: '2026-10-04',
  type: 'sunday_service' as const,
  title: null,
  notes: null,
  createdById: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  presentCount: 1,
};
const A = 'cluser000000000000000000a';
const B = 'cluser000000000000000000b';
const C = 'cluser000000000000000000c';
const member = (id: string, name: string, present: boolean, recorded = present) => ({
  user: { id, name, avatar: null },
  present,
  recorded,
});
const sheet = {
  service,
  members: [
    member(A, 'Ann Able', true),
    member(B, 'Bob Baker', false),
    member(C, 'Cy Cole', false, true),
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  servicesApi.getServiceAttendance.mockResolvedValue(sheet);
});

async function open() {
  const onClose = vi.fn();
  await render(<AttendanceSheet service={service} onClose={onClose} />);
  const dialog = await screen.findByRole('dialog', { name: 'Attendance' });
  await within(dialog).findByRole('checkbox', { name: 'Ann Able' });
  return { dialog, onClose };
}

describe('AttendanceSheet', () => {
  it('shows one checkbox per member with the recorded state', async () => {
    const { dialog } = await open();
    expect(dialog).toHaveTextContent(/Sunday Service on/);
    expect(within(dialog).getByRole('checkbox', { name: 'Ann Able' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Bob Baker' })).not.toBeChecked();
    expect(within(dialog).getByRole('group', { name: 'Present: 1 of 3 members' })).toBeTruthy();
    expect(servicesApi.getServiceAttendance).toHaveBeenCalledWith('s1', expect.anything());
  });

  it('saves the sheet in bulk and announces the result', async () => {
    servicesApi.saveServiceAttendance.mockResolvedValue({ present: 2, absent: 1 });
    const { dialog } = await open();
    const status = within(dialog).getByRole('status');
    expect(status).toHaveTextContent('');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Bob Baker' }));
    expect(within(dialog).getByRole('group', { name: 'Present: 2 of 3 members' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Attendance' }));
    await waitFor(() => expect(status).toHaveTextContent('Attendance saved: 2 present, 1 absent.'));
    // Bob is newly present; Cy was recorded before and stays absent; nobody else is touched.
    expect(servicesApi.saveServiceAttendance).toHaveBeenCalledWith('s1', {
      present: [A, B],
      absent: [C],
    });
  });

  it('filters by name and marks the shown members present or clears them', async () => {
    const { dialog } = await open();
    fireEvent.change(within(dialog).getByLabelText('Filter members'), {
      target: { value: 'bo' },
    });
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark shown present' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Bob Baker' })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText('Filter members'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expect(within(dialog).getByRole('group', { name: 'Present: 0 of 3 members' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark all present' }));
    expect(within(dialog).getByRole('group', { name: 'Present: 3 of 3 members' })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Filter members'), {
      target: { value: 'zz' },
    });
    expect(within(dialog).getByText('No members match the filter.')).toBeTruthy();
  });

  it('shows a failed save as an alert', async () => {
    servicesApi.saveServiceAttendance.mockRejectedValue(new ApiError(400, 'Unknown member'));
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Attendance' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Unknown member');
    expect(within(dialog).getByRole('status')).toHaveTextContent('');
  });

  it('shows a load error with Retry, and Close closes', async () => {
    servicesApi.getServiceAttendance.mockRejectedValueOnce(new ApiError(500, 'Boom'));
    const onClose = vi.fn();
    await render(<AttendanceSheet service={service} onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const dialog = screen.getByRole('dialog', { name: 'Attendance' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
