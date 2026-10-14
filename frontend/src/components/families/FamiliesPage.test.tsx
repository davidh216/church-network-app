import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FamiliesPage from '@/components/families/FamiliesPage';
import OwnFamily from '@/components/families/OwnFamily';
import { render } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const familiesApi = vi.hoisted(() => ({
  listFamilies: vi.fn(),
  createFamily: vi.fn(),
  getOwnFamily: vi.fn(),
}));
vi.mock('@/lib/api/families', () => familiesApi);

const summary = {
  id: 'f1',
  familyName: 'Doe',
  city: 'Springfield',
  head: { id: 'u1', name: 'Ann' },
  memberCount: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('FamiliesPage', () => {
  it('lists families with their head and member count, and searches by name', async () => {
    familiesApi.listFamilies.mockResolvedValue({
      families: [summary],
      total: 1,
      page: 1,
      pageSize: 25,
    });
    await render(<FamiliesPage />);
    const list = screen.getByRole('region', { name: 'All families' });
    expect(await within(list).findByRole('link', { name: 'Doe' })).toHaveAttribute(
      'href',
      '/families/f1',
    );
    expect(list).toHaveTextContent('3 members · Head: Ann');
    familiesApi.listFamilies.mockResolvedValue({ families: [], total: 0, page: 1, pageSize: 25 });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by name' }), {
      target: { value: 'Zed' },
    });
    await waitFor(() => expect(screen.getByText('No family matches “Zed”.')).toBeTruthy());
    expect(familiesApi.listFamilies).toHaveBeenLastCalledWith(
      { q: 'Zed', page: 1, pageSize: 25 },
      expect.anything(),
    );
  });

  it('creates a family and opens its page', async () => {
    familiesApi.listFamilies.mockResolvedValue({ families: [], total: 0, page: 1, pageSize: 25 });
    familiesApi.createFamily.mockResolvedValue({ ...summary, id: 'f9' });
    await render(<FamiliesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'New Family' }));
    const dialog = screen.getByRole('dialog', { name: 'New Family' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Family' }));
    expect(await within(dialog).findByText('Family name is required')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Family name *'), {
      target: { value: ' Roe ' },
    });
    fireEvent.change(within(dialog).getByLabelText('City'), { target: { value: 'Shelbyville' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Family' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/families/f9'));
    expect(familiesApi.createFamily).toHaveBeenCalledWith({
      familyName: 'Roe',
      address: null,
      city: 'Shelbyville',
      state: null,
      zipCode: null,
      country: null,
    });
  });
});

describe('OwnFamily', () => {
  it("shows the member's family read only, each relative with their relation", async () => {
    familiesApi.getOwnFamily.mockResolvedValue({
      familyName: 'Doe',
      relatives: [
        { name: 'Ann', relationship: 'parent' },
        { name: 'Cy', relationship: null },
      ],
    });
    await render(<OwnFamily headingId="mine" />);
    const section = screen.getByRole('region', { name: 'My family' });
    expect(await within(section).findByText('The Doe family')).toBeTruthy();
    expect(section).toHaveTextContent('AnnParent');
    expect(section).toHaveTextContent('CyFamily member');
    expect(within(section).queryByRole('link')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('says when the member has no family', async () => {
    familiesApi.getOwnFamily.mockResolvedValue(null);
    await render(<OwnFamily headingId="mine" />);
    expect(await screen.findByText('You are not linked to a family yet.')).toBeTruthy();
  });
});
