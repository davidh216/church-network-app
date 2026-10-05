import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MemberCards from '@/components/members/MemberCards';
import MemberRowActions from '@/components/members/MemberRowActions';
import { render } from '@/test/render';
import type { Member } from '@/types/domain';

const ada: Member = {
  id: 'a/1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  isActive: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  roles: [],
};

describe('MemberRowActions', () => {
  it('links View to the encoded profile path and calls onEdit', async () => {
    const onEdit = vi.fn();
    await render(<MemberRowActions member={ada} onEdit={onEdit} />);
    expect(screen.getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/members/a%2F1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(ada);
  });
});

describe('MemberCards', () => {
  it('shows initials, the default member role and staff-only status and actions', async () => {
    const onToggleSelect = vi.fn();
    await render(
      <MemberCards
        members={[ada]}
        canManage
        selected={new Set()}
        onToggleSelect={onToggleSelect}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('AL')).toBeTruthy();
    expect(screen.getByText('member')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSelect).toHaveBeenCalledWith('a/1');
  });

  it('hides selection, status and actions from members', async () => {
    await render(
      <MemberCards
        members={[ada]}
        canManage={false}
        selected={new Set()}
        onToggleSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Inactive')).toBeNull();
    expect(screen.queryByRole('link', { name: 'View' })).toBeNull();
  });
});
