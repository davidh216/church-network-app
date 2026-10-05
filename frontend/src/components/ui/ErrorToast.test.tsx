import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorToast from '@/components/ui/ErrorToast';

describe('ErrorToast', () => {
  it('shows the message with a full-contrast white Dismiss button', () => {
    const onDismiss = vi.fn();
    render(<ErrorToast message="Export failed" onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Export failed');
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toHaveClass('text-white');
    expect(dismiss.className).not.toMatch(/text-white\/\d+/);
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without a message', () => {
    const { container } = render(<ErrorToast message="" onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
