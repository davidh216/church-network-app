import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ChipInput from './ChipInput';

function Harness({
  initial = [],
  maxItems,
  error,
  normalize,
  onSubmit = () => undefined,
}: {
  initial?: string[];
  maxItems?: number;
  error?: string;
  normalize?: (value: string) => string;
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
        normalize={normalize}
      />
      <input aria-label="Next field" />
      <div data-testid="values">{values.join('|')}</div>
    </form>
  );
}

const input = () => screen.getByRole('textbox', { name: 'Skills' });
const values = () => screen.getByTestId('values').textContent;
const notice = () => document.getElementById('skills-notice');

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

  it('ignores blanks and refuses a case-insensitive duplicate visibly, keeping the text', () => {
    render(<Harness initial={['Music']} />);
    typeAndPress('   ');
    expect(input()).not.toHaveAccessibleDescription(/already/);
    typeAndPress('music');
    expect(values()).toBe('Music');
    expect(input()).toHaveValue('music');
    expect(notice()).toHaveTextContent('music is already in the list');
    expect(input()).toHaveAccessibleDescription(
      'Press Enter or a comma to add. music is already in the list',
    );
    expect(screen.getByRole('status')).toHaveTextContent('music is already in the list');
    // The notice goes as soon as the entry is edited.
    fireEvent.change(input(), { target: { value: 'musi' } });
    expect(notice()).toBeNull();
  });

  it('refuses an entry with an invalid character', () => {
    render(<Harness />);
    typeAndPress('a\u0000b');
    expect(values()).toBe('');
    expect(notice()).toHaveTextContent('contains an invalid character');
  });

  it('removes a chip with its button or the last one with Backspace', () => {
    render(<Harness initial={['Music', 'Teaching', 'Sound']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Teaching' }));
    expect(values()).toBe('Music|Sound');
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(values()).toBe('Music');
    expect(screen.getByRole('status')).toHaveTextContent('Removed Sound');
  });

  it('moves focus to the next chip, else the previous one, else the field after a removal', () => {
    render(<Harness initial={['Music', 'Teaching', 'Sound']} />);
    const removeButton = (name: string) => screen.getByRole('button', { name: `Remove ${name}` });
    removeButton('Teaching').focus();
    fireEvent.click(removeButton('Teaching'));
    expect(removeButton('Sound')).toHaveFocus();
    fireEvent.click(removeButton('Sound'));
    expect(removeButton('Music')).toHaveFocus();
    fireEvent.click(removeButton('Music'));
    expect(values()).toBe('');
    expect(input()).toHaveFocus();
  });

  it('keys and removes duplicate stored values one at a time', () => {
    render(<Harness initial={['Music', 'Music', 'Art']} />);
    expect(screen.getAllByRole('button', { name: 'Remove Music' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Music' })[1]!);
    expect(values()).toBe('Music|Art');
    expect(screen.getByRole('button', { name: 'Remove Art' })).toHaveFocus();
  });

  it('adds the typed value with the Add button or when the field loses focus', () => {
    render(<Harness />);
    const addButton = screen.getByRole('button', { name: 'Add to Skills' });
    expect(addButton).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(addButton);
    expect(values()).toBe('');
    fireEvent.change(input(), { target: { value: 'Music' } });
    expect(addButton).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(addButton);
    fireEvent.change(input(), { target: { value: 'Sound' } });
    fireEvent.blur(input());
    expect(values()).toBe('Music|Sound');
  });

  it('keeps the Add button focusable when Tab commits the entry on blur', () => {
    render(<Harness />);
    const addButton = screen.getByRole('button', { name: 'Add to Skills' });
    input().focus();
    fireEvent.change(input(), { target: { value: 'Music' } });
    // What a Tab does: the field blurs (committing the entry), then the button takes focus.
    act(() => addButton.focus());
    expect(values()).toBe('Music');
    expect(addButton).not.toBeDisabled();
    expect(addButton).toHaveFocus();
  });

  it('refuses entries beyond the maximum, keeping the typed text with a visible notice', () => {
    render(<Harness initial={['A', 'B']} maxItems={2} />);
    typeAndPress('C');
    expect(values()).toBe('A|B');
    expect(input()).toHaveValue('C');
    expect(notice()).toHaveTextContent('At most 2 entries: remove one to add another');
    fireEvent.blur(input());
    expect(values()).toBe('A|B');
    expect(input()).toHaveValue('C');
  });

  it('stores the normalised form and compares duplicates by it', () => {
    render(
      <Harness
        initial={['special-event']}
        normalize={(v) => v.toLowerCase().replace(/\s+/g, '-')}
      />,
    );
    typeAndPress('Easter Sunday');
    expect(values()).toBe('special-event|easter-sunday');
    typeAndPress('Special Event');
    expect(values()).toBe('special-event|easter-sunday');
    expect(input()).toHaveValue('Special Event');
  });

  it('ties the hint and the inline error to the field', () => {
    render(<Harness error="Skills cannot be blank" />);
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAccessibleDescription(
      'Press Enter or a comma to add. Skills cannot be blank',
    );
  });
});
