import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/render';
import AdvancedSearchBuilder from './AdvancedSearchBuilder';

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
});
