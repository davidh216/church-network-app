import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SEARCH_CONDITIONS } from '@embrace/shared';
import { render } from '@/test/render';
import AdvancedSearchBuilder from './AdvancedSearchBuilder';

const tagsApi = vi.hoisted(() => ({ listTags: vi.fn() }));
vi.mock('@/lib/api/tags', () => tagsApi);
const groupsApi = vi.hoisted(() => ({ listGroups: vi.fn() }));
vi.mock('@/lib/api/groups', () => groupsApi);

const TAG_A = 'clh3am8hi0000qwer1234abcd';
const TAG_B = 'clh3am8hi0001qwer1234abcd';
const GROUP_A = 'clh3am8hi0002qwer1234abcd';

beforeEach(() => {
  vi.resetAllMocks();
  tagsApi.listTags.mockResolvedValue([
    { id: TAG_A, name: 'Choir', isActive: true },
    { id: TAG_B, name: 'Old', isActive: false },
  ]);
  groupsApi.listGroups.mockResolvedValue([
    { id: GROUP_A, name: 'Youth', isActive: true, memberCount: 2 },
    { id: 'clh3am8hi0003qwer1234abcd', name: 'Gone', isActive: false, memberCount: 0 },
  ]);
});

async function setup(
  initialQuery: Parameters<typeof AdvancedSearchBuilder>[0]['initialQuery'] = null,
) {
  const onApply = vi.fn();
  const onClear = vi.fn();
  const onClose = vi.fn();
  const utils = await render(
    <AdvancedSearchBuilder
      initialQuery={initialQuery}
      onApply={onApply}
      onClear={onClear}
      onClose={onClose}
    />,
  );
  return { onApply, onClear, onClose, utils };
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AdvancedSearchBuilder', () => {
  it('builds tag, group and family conditions from the loaded choices', async () => {
    const { onApply } = await setup();
    change('Condition 1 field', 'tags');
    expect(
      within(screen.getByLabelText('Condition 1 operator'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['include any of', 'include all of', 'include none of']);
    change('Condition 1 operator', 'includesAll');
    const tags = screen.getByRole('group', { name: 'Condition 1 values' });
    fireEvent.click(await within(tags).findByRole('checkbox', { name: 'Choir' }));
    fireEvent.click(within(tags).getByRole('checkbox', { name: 'Old (archived)' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add Condition' }));
    change('Condition 2 field', 'groups');
    const groups = screen.getByRole('group', { name: 'Condition 2 values' });
    await waitFor(() =>
      expect(
        within(groups)
          .getAllByRole('checkbox')
          .map((c) => c.parentElement?.textContent),
      ).toEqual(['Youth']),
    );
    fireEvent.click(within(groups).getByRole('checkbox', { name: 'Youth' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add Condition' }));
    change('Condition 3 field', 'family');
    change('Condition 3 operator', 'isNotEmpty');
    expect(screen.queryByLabelText('Condition 3 value')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Search' }));
    expect(onApply).toHaveBeenCalledWith({
      conditions: [
        { field: 'tags', operator: 'includesAll', value: [TAG_A, TAG_B] },
        { field: 'groups', operator: 'includesAny', value: [GROUP_A] },
        { field: 'family', operator: 'isNotEmpty' },
      ],
      logic: 'AND',
    });
  });

  it('says the tags are loading, not that there are none, until they arrive', async () => {
    let resolveTags: (tags: unknown[]) => void = () => undefined;
    tagsApi.listTags.mockReturnValue(new Promise((resolve) => (resolveTags = resolve)));
    await setup();
    change('Condition 1 field', 'tags');
    const tags = screen.getByRole('group', { name: 'Condition 1 values' });
    expect(tags).toHaveTextContent('Loading…');
    expect(tags).not.toHaveTextContent('No tags to choose from');
    resolveTags([]);
    await waitFor(() => expect(tags).toHaveTextContent('No tags to choose from'));
  });

  it('asks for a tag before applying', async () => {
    const { onApply } = await setup();
    change('Condition 1 field', 'tags');
    fireEvent.click(screen.getByRole('button', { name: 'Apply Search' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('Choose at least one value')).toBeInTheDocument();
  });

  it('builds stage equals new_member AND engagement at least 50', async () => {
    const { onApply } = await setup();
    change('Condition 1 field', 'engagement.membershipStage');
    // Only the operators the API allows for the field are offered.
    const operators = within(screen.getByLabelText('Condition 1 operator')).getAllByRole('option');
    expect(operators.map((o) => o.textContent)).toEqual(['equals', 'is one of']);
    change('Condition 1 value', 'new_member');

    fireEvent.click(screen.getByRole('button', { name: 'Add Condition' }));
    change('Condition 2 field', 'engagement.engagementScore');
    change('Condition 2 operator', 'gte');
    expect(screen.getByLabelText('Condition 2 value')).toHaveAttribute('type', 'number');
    change('Condition 2 value', '50');

    fireEvent.click(screen.getByRole('button', { name: 'Apply Search' }));
    expect(onApply).toHaveBeenCalledWith({
      conditions: [
        { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
        { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
      ],
      logic: 'AND',
    });
  });

  it('shows two inputs for between and inline errors instead of applying', async () => {
    const { onApply } = await setup();
    change('Condition 1 field', 'createdAt');
    change('Condition 1 operator', 'between');
    change('Condition 1 from', '2026-02-01');
    change('Condition 1 to', '2026-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Apply Search' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('The first value must not exceed the second')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the condition above.');
    const from = screen.getByLabelText('Condition 1 from');
    expect(from).toHaveAttribute('aria-invalid', 'true');
    expect(from).toHaveAccessibleDescription('The first value must not exceed the second');
  });

  it('offers checkboxes for "is one of" and combines with OR', async () => {
    const { onApply } = await setup();
    change('Match', 'OR');
    change('Condition 1 field', 'engagement.riskLevel');
    change('Condition 1 operator', 'in');
    const group = screen.getByRole('group', { name: 'Condition 1 values' });
    fireEvent.click(within(group).getByLabelText('High'));
    fireEvent.click(within(group).getByLabelText('Medium'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Search' }));
    expect(onApply).toHaveBeenCalledWith({
      conditions: [{ field: 'engagement.riskLevel', operator: 'in', value: ['high', 'medium'] }],
      logic: 'OR',
    });
  });

  it('starts from the given query and can remove conditions down to one', async () => {
    const { onClear, onClose } = await setup({
      conditions: [
        { field: 'name', operator: 'contains', value: 'ann' },
        { field: 'isActive', operator: 'equals', value: true },
      ],
      logic: 'AND',
    });
    expect(screen.getByLabelText('Condition 1 value')).toHaveValue('ann');
    expect(screen.getByLabelText('Condition 2 value')).toHaveValue('true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition 2' }));
    expect(screen.getByRole('button', { name: 'Remove condition 1' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(onClear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close advanced search' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('allows at most MAX_SEARCH_CONDITIONS conditions', async () => {
    await setup();
    const add = screen.getByRole('button', { name: 'Add Condition' });
    for (let i = 1; i < MAX_SEARCH_CONDITIONS; i++) fireEvent.click(add);
    expect(screen.getByLabelText(`Condition ${MAX_SEARCH_CONDITIONS} field`)).toBeInTheDocument();
    expect(add).toBeDisabled();
  });
});
