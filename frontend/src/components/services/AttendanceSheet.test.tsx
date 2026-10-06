import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceSheet from '@/components/services/AttendanceSheet';
import { ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { makeTestQueryClient, queryWrapper, render, settle } from '@/test/render';

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
  user: {
    id,
    name,
    email: `${name.split(' ')[0]!.toLowerCase()}-${id.slice(-1)}@example.com`,
    avatar: null,
  },
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
  const dialog = await screen.findByRole('dialog', { name: /^Attendance: Sunday Service on / });
  await within(dialog).findByRole('checkbox', { name: 'Ann Able' });
  return { dialog, onClose };
}

const box = (dialog: HTMLElement, name: string) => within(dialog).getByRole('checkbox', { name });
const saveButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: 'Save Attendance' });

describe('AttendanceSheet', () => {
  it('shows one checkbox per member with the recorded state', async () => {
    const { dialog } = await open();
    expect(box(dialog, 'Bob Baker')).toHaveAccessibleDescription(`bob-b@example.com`);
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
    // Only Bob changed: Ann (present) and Cy (recorded absent) are not sent again.
    expect(servicesApi.saveServiceAttendance).toHaveBeenCalledWith('s1', {
      present: [B],
      absent: [],
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
    const dialog = screen.getByRole('dialog', { name: /^Attendance: / });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps a mark another staff member saved meanwhile when saving again', async () => {
    servicesApi.saveServiceAttendance.mockResolvedValue({ present: 3, absent: 0 });
    const { dialog } = await open();
    // The refetch after the first save brings Cy, marked present by someone else.
    servicesApi.getServiceAttendance.mockResolvedValue({
      service,
      members: [
        member(A, 'Ann Able', true),
        member(B, 'Bob Baker', true),
        member(C, 'Cy Cole', true),
      ],
    });
    fireEvent.click(box(dialog, 'Bob Baker'));
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(box(dialog, 'Cy Cole')).toBeChecked());
    expect(box(dialog, 'Bob Baker')).toBeChecked();
    fireEvent.click(box(dialog, 'Ann Able'));
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(servicesApi.saveServiceAttendance).toHaveBeenCalledTimes(2));
    expect(servicesApi.saveServiceAttendance).toHaveBeenLastCalledWith('s1', {
      present: [],
      absent: [A],
    });
  });

  it('starts from the refetched sheet when the cached one is stale', async () => {
    const client = makeTestQueryClient();
    client.setQueryData(queryKeys.services.attendance('s1'), sheet, {
      updatedAt: Date.now() - 60_000,
    });
    servicesApi.getServiceAttendance.mockResolvedValue({
      service,
      members: [member(A, 'Ann Able', true), member(B, 'Bob Baker', true), sheet.members[2]],
    });
    servicesApi.saveServiceAttendance.mockResolvedValue({ present: 2, absent: 1 });
    rtlRender(<AttendanceSheet service={service} onClose={vi.fn()} />, {
      wrapper: queryWrapper(client),
    });
    const dialog = await screen.findByRole('dialog', { name: /^Attendance: / });
    await waitFor(() => expect(box(dialog, 'Bob Baker')).toBeChecked());
    fireEvent.click(box(dialog, 'Cy Cole'));
    fireEvent.click(saveButton(dialog));
    await waitFor(() =>
      expect(servicesApi.saveServiceAttendance).toHaveBeenCalledWith('s1', {
        present: [C],
        absent: [],
      }),
    );
  });

  it('sends only members whose mark changes when marking all present', async () => {
    servicesApi.saveServiceAttendance.mockResolvedValue({ present: 3, absent: 0 });
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark all present' }));
    fireEvent.click(saveButton(dialog));
    await waitFor(() =>
      expect(servicesApi.saveServiceAttendance).toHaveBeenCalledWith('s1', {
        present: [B, C],
        absent: [],
      }),
    );
  });

  it('keeps a change made while the save is in flight and does not report it saved', async () => {
    let resolve: (value: { present: number; absent: number }) => void = () => {};
    servicesApi.saveServiceAttendance.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { dialog } = await open();
    fireEvent.click(box(dialog, 'Bob Baker'));
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(servicesApi.saveServiceAttendance).toHaveBeenCalledTimes(1));
    // The refetch after the save shows Bob present; Cy is ticked while the request runs.
    servicesApi.getServiceAttendance.mockResolvedValue({
      service,
      members: [member(A, 'Ann Able', true), member(B, 'Bob Baker', true), sheet.members[2]],
    });
    fireEvent.click(box(dialog, 'Cy Cole'));
    resolve({ present: 2, absent: 1 });
    const status = within(dialog).getByRole('status');
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'Attendance saved: 2 present, 1 absent. Changes made while saving are not saved yet.',
      ),
    );
    expect(box(dialog, 'Cy Cole')).toBeChecked();
    expect(box(dialog, 'Bob Baker')).toBeChecked();
    servicesApi.saveServiceAttendance.mockResolvedValue({ present: 3, absent: 0 });
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(servicesApi.saveServiceAttendance).toHaveBeenCalledTimes(2));
    expect(servicesApi.saveServiceAttendance).toHaveBeenLastCalledWith('s1', {
      present: [C],
      absent: [],
    });
  });

  it('clears the filter on Escape without closing, and Enter does not save', async () => {
    const { dialog, onClose } = await open();
    const filter = within(dialog).getByLabelText('Filter members');
    fireEvent.change(filter, { target: { value: 'bo' } });
    fireEvent.keyDown(filter, { key: 'Enter' });
    fireEvent.keyDown(filter, { key: 'Escape' });
    expect(filter).toHaveValue('');
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
    expect(onClose).not.toHaveBeenCalled();
    expect(servicesApi.saveServiceAttendance).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /^Attendance: / })).toBeTruthy();
  });

  it('asks before discarding unsaved marks on Close, Escape or the backdrop', async () => {
    const { dialog, onClose } = await open();
    fireEvent.click(box(dialog, 'Bob Baker'));
    const confirm = () =>
      screen.getByRole('dialog', { name: 'Discard unsaved attendance changes?' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(within(confirm()).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    fireEvent.click(within(confirm()).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog', { name: /Discard/ })).toBeNull();
    expect(box(dialog, 'Bob Baker')).toBeChecked();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(confirm()).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Discard/ })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog.parentElement!);
    fireEvent.click(within(confirm()).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once when nothing is unsaved (a mark set back counts as unchanged)', async () => {
    const { dialog, onClose } = await open();
    fireEvent.click(box(dialog, 'Bob Baker'));
    fireEvent.click(box(dialog, 'Bob Baker'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await settle();
  });

  it('tells members with the same name apart by email', async () => {
    servicesApi.getServiceAttendance.mockResolvedValue({
      service,
      members: [
        member(A, 'Ann Able', true),
        member(B, 'Ann Able', false),
        member(C, 'Cy Cole', false),
      ],
    });
    await render(<AttendanceSheet service={service} onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: /^Attendance: / });
    expect(box(dialog, 'Ann Able (ann-a@example.com)')).toBeChecked();
    expect(box(dialog, 'Ann Able (ann-b@example.com)')).not.toBeChecked();
    expect(box(dialog, 'Cy Cole')).toHaveAccessibleDescription('cy-c@example.com');
    fireEvent.change(within(dialog).getByLabelText('Filter members'), {
      target: { value: 'ann-b@' },
    });
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
  });
});
