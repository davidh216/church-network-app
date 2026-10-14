import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FamilyDetailPage from '@/components/families/FamilyDetailPage';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);
const familiesApi = vi.hoisted(() => ({
  getFamily: vi.fn(),
  updateFamily: vi.fn(),
  deleteFamily: vi.fn(),
  putFamilyMember: vi.fn(),
  removeFamilyMember: vi.fn(),
  setFamilyRelationship: vi.fn(),
  removeFamilyRelationship: vi.fn(),
}));
vi.mock('@/lib/api/families', () => familiesApi);
const usersApi = vi.hoisted(() => ({ listUsers: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const U1 = 'cuser1aaaaaaaaaaaaaaaaaaaa';
const U2 = 'cuser2aaaaaaaaaaaaaaaaaaaa';
const member = (id: string, name: string, isHead = false) => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.org`,
  isActive: true,
  isHead,
});
const doe = {
  id: 'f1',
  familyName: 'Doe',
  address: '1 Main St',
  city: 'Springfield',
  state: null,
  zipCode: null,
  country: null,
  head: { id: U1, name: 'Ann' },
  members: [member(U1, 'Ann', true), member(U2, 'Ben')],
  relationships: [
    {
      id: 'r1',
      user: { id: U1, name: 'Ann' },
      relatedUser: { id: U2, name: 'Ben' },
      type: 'parent',
      inverseType: 'child',
      isActive: true,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function renderAs(roles: string[]) {
  authApi.me.mockResolvedValue(makeUser(roles));
  return render(
    <AuthProvider>
      <FamilyDetailPage id="f1" />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('FamilyDetailPage', () => {
  it('shows the address, head, members and relationships from both sides', async () => {
    familiesApi.getFamily.mockResolvedValue(doe);
    await renderAs(['leader']);
    expect(screen.getByRole('heading', { level: 1, name: 'Doe family' })).toBeTruthy();
    expect(screen.getByText('1 Main St, Springfield')).toBeTruthy();
    const members = screen.getByRole('region', { name: 'Members (2)' });
    expect(within(members).getByRole('link', { name: 'Ann' })).toHaveAttribute(
      'href',
      `/members/${U1}`,
    );
    expect(within(members).getByRole('combobox', { name: 'Head of family' })).toHaveValue(U1);
    const relationships = screen.getByRole('region', { name: 'Relationships' });
    expect(relationships).toHaveTextContent('Ann is the parent of Ben · Ben is the child of Ann');
    // Leaders cannot delete a family.
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('says a missing family is not found, without Retry', async () => {
    familiesApi.getFamily.mockRejectedValue(new ApiError(404, 'Family not found'));
    await renderAs(['leader']);
    expect(screen.getByRole('alert')).toHaveTextContent('Family not found');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('changes the head and removes a member after confirming', async () => {
    familiesApi.getFamily.mockResolvedValue(doe);
    familiesApi.updateFamily.mockResolvedValue(doe);
    familiesApi.removeFamilyMember.mockResolvedValue(undefined);
    await renderAs(['leader']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Head of family' }), {
      target: { value: U2 },
    });
    await settle();
    expect(familiesApi.updateFamily).toHaveBeenCalledWith('f1', { headOfFamilyId: U2 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ben from the family' }));
    expect(familiesApi.removeFamilyMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Ben' }));
    await settle();
    expect(familiesApi.removeFamilyMember).toHaveBeenCalledWith('f1', U2);
  });

  it('asks before moving someone from another family, then moves them', async () => {
    familiesApi.getFamily.mockResolvedValue(doe);
    usersApi.listUsers.mockResolvedValue({
      users: [{ id: 'u3', name: 'Cy', email: 'cy@example.org' }],
      total: 1,
      page: 1,
      pageSize: 8,
    });
    familiesApi.putFamilyMember
      .mockRejectedValueOnce(
        new ApiError(409, 'Cy already belongs to the Roe family', 'IN_OTHER_FAMILY'),
      )
      .mockResolvedValueOnce({
        member: member('u3', 'Cy'),
        movedFrom: { id: 'f2', familyName: 'Roe' },
      });
    await renderAs(['leader']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a member' }), {
      target: { value: 'Cy' },
    });
    const results = await screen.findByRole('list', { name: 'Matching members' });
    fireEvent.click(within(results).getByRole('button', { name: 'Add Cy to the family' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move Cy?' });
    expect(dialog).toHaveTextContent('Cy already belongs to the Roe family.');
    familiesApi.getFamily.mockResolvedValue({
      ...doe,
      members: [...doe.members, member('u3', 'Cy')],
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to this family' }));
    await waitFor(() => expect(screen.getByText('Cy moved from the Roe family.')).toBeTruthy());
    // The Add button that opened the dialog is gone: focus is back in the search field.
    await waitFor(() =>
      expect(screen.getByRole('searchbox', { name: 'Find a member' })).toHaveFocus(),
    );
    expect(familiesApi.putFamilyMember).toHaveBeenNthCalledWith(1, 'f1', 'u3', false);
    expect(familiesApi.putFamilyMember).toHaveBeenNthCalledWith(2, 'f1', 'u3', true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sets a relationship as a sentence, and removes one', async () => {
    familiesApi.getFamily.mockResolvedValue(doe);
    familiesApi.setFamilyRelationship.mockResolvedValue(doe.relationships[0]);
    familiesApi.removeFamilyRelationship.mockResolvedValue(undefined);
    await renderAs(['leader']);
    fireEvent.click(screen.getByRole('button', { name: 'Set relationship' }));
    const dialog = screen.getByRole('dialog', { name: 'Set Relationship' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'is the' }), {
      target: { value: 'grandparent' },
    });
    expect(dialog).toHaveTextContent('Ann is the grandparent of Ben.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Relationship' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(familiesApi.setFamilyRelationship).toHaveBeenCalledWith('f1', {
      userId: U1,
      relatedUserId: U2,
      type: 'grandparent',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove relationship: Ann is the parent of Ben' }),
    );
    await settle();
    expect(familiesApi.removeFamilyRelationship).toHaveBeenCalledWith('f1', 'r1');
  });

  it('lets an admin delete the family after confirming', async () => {
    familiesApi.getFamily.mockResolvedValue(doe);
    familiesApi.deleteFamily.mockResolvedValue({ members: 2, relationships: 1 });
    await renderAs(['admin']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Family?' });
    expect(dialog).toHaveTextContent('Its 2 members stay in the directory without a family.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Family' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/families'));
    expect(familiesApi.deleteFamily).toHaveBeenCalledWith('f1');
  });

  it('moves focus to the next row after removing a member or a relationship, else the heading', async () => {
    const U3 = 'cuser3aaaaaaaaaaaaaaaaaaaa';
    const rel = (id: string, other: { id: string; name: string }) => ({
      ...doe.relationships[0]!,
      id,
      relatedUser: other,
    });
    const three = {
      ...doe,
      members: [...doe.members, member(U3, 'Cy')],
      relationships: [rel('r1', { id: U2, name: 'Ben' }), rel('r2', { id: U3, name: 'Cy' })],
    };
    familiesApi.getFamily.mockResolvedValue(three);
    familiesApi.removeFamilyMember.mockResolvedValue(undefined);
    familiesApi.removeFamilyRelationship.mockResolvedValue(undefined);
    await renderAs(['leader']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ben from the family' }));
    familiesApi.getFamily.mockResolvedValue({
      ...three,
      members: [three.members[0], three.members[2]],
      relationships: [three.relationships[1]],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Ben' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Cy from the family' })).toHaveFocus(),
    );

    familiesApi.getFamily.mockResolvedValue({
      ...three,
      members: [three.members[0], three.members[2]],
      relationships: [],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove relationship: Ann is the parent of Cy' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Relationships' })).toHaveFocus(),
    );
  });
});
