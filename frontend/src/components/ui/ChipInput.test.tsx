import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ChipInput from './ChipInput';

function Harness({
  initial = [],
  maxItems,
  error,
  onSubmit = () => undefined,
}: {
  initial?: string[];
  maxItems?: number;
  error?: string;
  onSubmit?: () => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <ChipInput
        id="skills"
        label="Skills"
        values={values}
        onChange={setValues}
        maxItems={maxItems}
        error={error}
      />
      <div data-testid="values">{values.join('|')}</div>
    </form>
  );
}

const input = () => screen.getByRole('textbox', { name: 'Skills' });
const values = () => screen.getByTestId('values').textContent;

function typeAndPress(text: string, key = 'Enter') {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key });
}

describe('ChipInput', () => {
  it('adds trimmed values with Enter or a comma without submitting the form', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    typeAndPress('  Music ');
    typeAndPress('Teaching', ',');
    expect(values()).toBe('Music|Teaching');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input()).toHaveValue('');
    const list = screen.getByRole('list', { name: 'Skills' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Music×', 'Teaching×']);
    expect(screen.getByRole('status')).toHaveTextContent('Added Teaching');
  });

  it('ignores blanks and case-insensitive duplicates', () => {
    render(<Harness initial={['Music']} />);
    typeAndPress('   ');
    typeAndPress('music');
    expect(values()).toBe('Music');
    expect(screen.getByRole('status')).toHaveTextContent('music is already in the list');
  });

  it('removes a chip with its button or the last one with Backspace', () => {
    render(<Harness initial={['Music', 'Teaching', 'Sound']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Teaching' }));
    expect(values()).toBe('Music|Sound');
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(values()).toBe('Music');
    expect(screen.getByRole('status')).toHaveTextContent('Removed Sound');
  });

  it('adds the typed value with the Add button or when the field loses focus', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Add to Skills' })).toBeDisabled();
    fireEvent.change(input(), { target: { value: 'Music' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Skills' }));
    fireEvent.change(input(), { target: { value: 'Sound' } });
    fireEvent.blur(input());
    expect(values()).toBe('Music|Sound');
  });

  it('refuses entries beyond the maximum', () => {
    render(<Harness initial={['A', 'B']} maxItems={2} />);
    typeAndPress('C');
    expect(values()).toBe('A|B');
    expect(screen.getByRole('status')).toHaveTextContent('At most 2 entries');
  });

  it('ties the hint and the inline error to the field', () => {
    render(<Harness error="Skills cannot be blank" />);
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAccessibleDescription(
      'Press Enter or a comma to add. Skills cannot be blank',
    );
  });
});
