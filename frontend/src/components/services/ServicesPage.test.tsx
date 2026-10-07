import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServicesPage from '@/components/services/ServicesPage';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { currentMonth, monthBounds, monthTitle, shiftMonth } from '@/lib/services/services';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);
const servicesApi = vi.hoisted(() => ({
  listServices: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  getServiceAttendance: vi.fn(),
  saveServiceAttendance: vi.fn(),
}));
vi.mock('@/lib/api/services', () => servicesApi);

const month = currentMonth();
const { from } = monthBounds(month);
const service = {
  id: 's1',
  date: from,
  type: 'sunday_service' as const,
  title: 'Harvest',
  notes: null,
  createdById: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  presentCount: 1,
};
const page = (services: unknown[]) => ({
  services,
  total: services.length,
  page: 1,
  pageSize: 100,
});

async function renderAs(roles: string[]) {
  authApi.me.mockResolvedValue(makeUser(roles));
  return render(
    <AuthProvider>
      <ServicesPage />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  servicesApi.listServices.mockResolvedValue(page([service]));
});

describe('ServicesPage', () => {
  it("lists the current month's services and moves between months", async () => {
    await renderAs(['leader']);
    expect(await screen.findByRole('cell', { name: 'Harvest' })).toBeTruthy();
    // The first of the month as a calendar day, not the evening before (tests run in Los Angeles).
    const [year, monthNumber] = from.split('-').map(Number) as [number, number];
    const shortMonths = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
    expect(
      screen.getByRole('cell', { name: `${shortMonths[monthNumber - 1]} 1, ${year}` }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: `Attendance for Harvest (Sunday Service) on ${monthNumber}/1/${year}`,
      }),
    ).toBeTruthy();
    expect(servicesApi.listServices).toHaveBeenCalledWith(
      { ...monthBounds(month), pageSize: 100 },
      expect.anything(),
    );
    // Leaders may not delete; only admins see the action.
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    servicesApi.listServices.mockResolvedValue(page([]));
    fireEvent.click(screen.getByRole('button', { name: /^Previous month/ }));
    expect(await screen.findByText(/^No services in/)).toBeTruthy();
    const [params] = servicesApi.listServices.mock.calls.at(-1)!;
    expect(params.to < from).toBe(true);
  });

  it('shows an error with Retry', async () => {
    servicesApi.listServices.mockRejectedValueOnce(new ApiError(500, 'Boom'));
    await renderAs(['leader']);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('cell', { name: 'Harvest' })).toBeTruthy();
  });

  it('creates a service and shows a 409 conflict inside the dialog', async () => {
    await renderAs(['leader']);
    fireEvent.click(await screen.findByRole('button', { name: 'New Service' }));
    const dialog = screen.getByRole('dialog', { name: 'New Service' });
    expect(within(dialog).getByLabelText('Type *')).toHaveValue('sunday_service');
    servicesApi.createService.mockRejectedValueOnce(
      new ApiError(409, 'A service of this type already exists on that date', 'CONFLICT'),
    );
    fireEvent.change(within(dialog).getByLabelText('Date *'), { target: { value: from } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Service' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A service of this type already exists on that date',
    );
    // No field is at fault, so focus moves to the message.
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveFocus());

    servicesApi.createService.mockResolvedValueOnce({ ...service, id: 's2', type: 'bible_study' });
    fireEvent.change(within(dialog).getByLabelText('Type *'), {
      target: { value: 'bible_study' },
    });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: '  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Service' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(servicesApi.createService).toHaveBeenLastCalledWith({
      date: from,
      type: 'bible_study',
      title: null,
      notes: null,
    });
  });

  it('validates the date before calling the API', async () => {
    await renderAs(['leader']);
    fireEvent.click(await screen.findByRole('button', { name: 'New Service' }));
    const dialog = screen.getByRole('dialog', { name: 'New Service' });
    fireEvent.change(within(dialog).getByLabelText('Date *'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Service' }));
    expect(await within(dialog).findByText('Enter a valid date')).toBeTruthy();
    expect(within(dialog).getByLabelText('Date *')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Date *')).toHaveAccessibleDescription(
      'Enter a valid date',
    );
    await waitFor(() => expect(within(dialog).getByLabelText('Date *')).toHaveFocus());
    expect(servicesApi.createService).not.toHaveBeenCalled();
  });

  it('switches to the month of a service created in another month', async () => {
    const next = shiftMonth(month, 1);
    const nextFrom = monthBounds(next).from;
    servicesApi.createService.mockResolvedValueOnce({ ...service, id: 's2', date: nextFrom });
    await renderAs(['leader']);
    fireEvent.click(await screen.findByRole('button', { name: 'New Service' }));
    const dialog = screen.getByRole('dialog', { name: 'New Service' });
    fireEvent.change(within(dialog).getByLabelText('Date *'), { target: { value: nextFrom } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Service' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: monthTitle(next) })).toBeTruthy();
    await waitFor(() =>
      expect(servicesApi.listServices.mock.calls.at(-1)![0]).toEqual({
        ...monthBounds(next),
        pageSize: 100,
      }),
    );
  });

  it("shows loading, not the previous month's rows, while another month loads", async () => {
    await renderAs(['leader']);
    await screen.findByRole('cell', { name: 'Harvest' });
    let resolve: (value: unknown) => void = () => {};
    servicesApi.listServices.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Next month/ }));
    expect(
      screen.getByRole('heading', { level: 2, name: monthTitle(shiftMonth(month, 1)) }),
    ).toBeTruthy();
    expect(await screen.findByRole('status', { name: 'Loading services' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: 'Harvest' })).toBeNull();
    resolve(page([]));
    expect(await screen.findByText(/^No services in/)).toBeTruthy();
  });

  it('says which services a capped month leaves out', async () => {
    servicesApi.listServices.mockResolvedValue({ ...page([service]), total: 120 });
    await renderAs(['leader']);
    expect(
      await screen.findByText(
        'Showing the latest 1 of 120 services this month; the earliest are not listed.',
      ),
    ).toBeTruthy();
  });

  it('edits a service', async () => {
    servicesApi.updateService.mockResolvedValue({ ...service, title: 'Harvest Sunday' });
    await renderAs(['leader']);
    fireEvent.click(await screen.findByRole('button', { name: /^Edit Harvest/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Service' });
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Harvest');
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Harvest Sunday' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Only the changed field is sent.
    expect(servicesApi.updateService).toHaveBeenCalledWith('s1', { title: 'Harvest Sunday' });
  });

  it('clears a field on edit, and saving without changes sends nothing', async () => {
    servicesApi.updateService.mockResolvedValue({ ...service, title: null });
    await renderAs(['leader']);
    fireEvent.click(await screen.findByRole('button', { name: /^Edit Harvest/ }));
    let dialog = screen.getByRole('dialog', { name: 'Edit Service' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(servicesApi.updateService).toHaveBeenCalledWith('s1', { title: null });

    fireEvent.click(await screen.findByRole('button', { name: /^Edit Harvest/ }));
    dialog = screen.getByRole('dialog', { name: 'Edit Service' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(servicesApi.updateService).toHaveBeenCalledTimes(1);
  });

  it('lets an admin delete a service after confirming', async () => {
    servicesApi.deleteService.mockResolvedValue(undefined);
    await renderAs(['admin']);
    // The refetch after the delete no longer has the row, so focus goes to the heading.
    servicesApi.listServices.mockResolvedValue(page([]));
    const remove = await screen.findByRole('button', { name: /^Delete Harvest/ });
    remove.focus();
    fireEvent.click(remove);
    const dialog = screen.getByRole('dialog', { name: 'Delete Service?' });
    expect(dialog).toHaveTextContent(/attendance records \(1 present\) will be deleted/);
    // Cancel is focused first, so Enter does not delete by accident.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Service' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText(/^No services in/);
    expect(servicesApi.deleteService).toHaveBeenCalledWith('s1');
    expect(screen.getByRole('heading', { level: 1, name: 'Services' })).toHaveFocus();
  });

  it('shows a failed delete in the dialog', async () => {
    servicesApi.deleteService.mockRejectedValue(new ApiError(403, 'Forbidden'));
    await renderAs(['admin']);
    fireEvent.click(await screen.findByRole('button', { name: /^Delete Harvest/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Service?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Service' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Forbidden');
    await settle();
  });
});
