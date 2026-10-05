import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Dialog from '@/components/ui/Dialog';

function Harness({
  onClose = vi.fn(),
  closeOnBackdrop,
}: {
  onClose?: () => void;
  closeOnBackdrop?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Dialog labelledBy="t" onClose={close} closeOnBackdrop={closeOnBackdrop}>
          <h2 id="t">Edit thing</h2>
          <input aria-label="First" />
          <button type="button" disabled>
            Disabled
          </button>
          <button type="button" onClick={close}>
            Last
          </button>
        </Dialog>
      )}
    </div>
  );
}

function open() {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('Dialog', () => {
  it('is a modal dialog named by its heading, with focus moved to the first control', () => {
    render(<Harness />);
    open();
    const dialog = screen.getByRole('dialog', { name: 'Edit thing' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(screen.getByLabelText('First'));
  });

  it('keeps Tab and Shift+Tab inside, skipping disabled controls', () => {
    render(<Harness />);
    open();
    const first = screen.getByLabelText('First');
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    // Focus that escaped the dialog is pulled back in.
    screen.getByRole('button', { name: 'Open' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('closes on Escape and gives focus back to the opener', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a backdrop click but not on a click inside, unless backdrop closing is off', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);
    open();
    fireEvent.click(screen.getByLabelText('First'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const ignored = vi.fn();
    render(<Harness onClose={ignored} closeOnBackdrop={false} />);
    open();
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('locks page scrolling while open and restores it on close', () => {
    document.body.style.overflow = 'auto';
    render(<Harness />);
    open();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Last' }));
    expect(document.body.style.overflow).toBe('auto');
  });

  it('runs onEscape instead of onClose when given', () => {
    const onClose = vi.fn();
    const onEscape = vi.fn();
    render(
      <Dialog labelledBy="x" onClose={onClose} onEscape={onEscape}>
        <h2 id="x">X</h2>
      </Dialog>,
    );
    // With nothing focusable inside, the dialog itself takes focus.
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets only the most recently opened dialog react to Escape', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const ui = (withInner: boolean) => (
      <Dialog labelledBy="o" onClose={outer}>
        <h2 id="o">Outer</h2>
        {withInner && (
          <Dialog labelledBy="i" onClose={inner}>
            <h2 id="i">Inner</h2>
          </Dialog>
        )}
      </Dialog>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    rerender(ui(false));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('sends focus that reaches a guard (from a cross-origin iframe) back into the panel', () => {
    render(<Harness />);
    open();
    const [before, after] = Array.from(
      document.querySelectorAll<HTMLElement>('[data-focus-guard]'),
    );
    const dialog = screen.getByRole('dialog');
    expect(before!.nextElementSibling).toBe(dialog);
    expect(after!.previousElementSibling).toBe(dialog);
    // Tab out of the last control (the browser moves focus without a keydown we can see).
    after!.focus();
    expect(document.activeElement).toBe(screen.getByLabelText('First'));
    // Shift+Tab out of the first control.
    before!.focus();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }));
  });

  it('focuses fallbackFocus on close when the opener has gone', () => {
    function Removing() {
      const [open, setOpen] = useState(false);
      const [rowGone, setRowGone] = useState(false);
      const heading = useRef<HTMLHeadingElement>(null);
      return (
        <div>
          <h1 ref={heading} tabIndex={-1}>
            Members
          </h1>
          {!rowGone && (
            <button type="button" onClick={() => setOpen(true)}>
              Edit row
            </button>
          )}
          {open && (
            <Dialog labelledBy="e" onClose={() => setOpen(false)} fallbackFocus={heading}>
              <h2 id="e">Edit</h2>
              <button
                type="button"
                onClick={() => {
                  setRowGone(true);
                  setOpen(false);
                }}
              >
                Save
              </button>
            </Dialog>
          )}
        </div>
      );
    }
    render(<Removing />);
    const opener = screen.getByRole('button', { name: 'Edit row' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('button', { name: 'Edit row' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Members' }));
  });
});
