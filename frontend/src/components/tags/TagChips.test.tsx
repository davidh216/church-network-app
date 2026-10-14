import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemberTagChips, TagChip } from './TagChips';

const tag = (name: string, isActive = true) => ({ id: name, name, color: '#123456', isActive });

describe('tag chips', () => {
  it('marks an archived tag', () => {
    render(<TagChip tag={tag('Old', false)} />);
    expect(screen.getByText('Old').textContent).toBe('Old (archived)');
  });

  it('shows at most three tags on a row, then +n naming the rest', () => {
    render(<MemberTagChips tags={['A', 'B', 'C', 'D', 'E'].map((n) => tag(n))} />);
    const list = screen.getByRole('list', { name: 'Tags' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['A', 'B', 'C', '+2and 2 more: D, E']);
  });

  it('shows nothing without tags (members never receive them)', () => {
    const { container } = render(<MemberTagChips tags={undefined} />);
    expect(container.innerHTML).toBe('');
    render(<MemberTagChips tags={[tag('A'), tag('B'), tag('C')]} />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});
