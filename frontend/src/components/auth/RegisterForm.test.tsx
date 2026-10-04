import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterForm from '@/components/auth/RegisterForm';
import { ApiError } from '@/lib/api/client';
import { render, settle } from '@/test/render';

const authApi = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('@/lib/api/auth', () => authApi);

const PENDING = 'Registration received. An administrator will review your account before you can sign in.';

function fill(name: string, email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  await settle();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RegisterForm', () => {
  it('shows the pending-approval message from the API after registering', async () => {
    authApi.register.mockResolvedValue({ success: true, message: PENDING, pendingApproval: true });
    const onSwitchToLogin = vi.fn();
    await render(<RegisterForm onSwitchToLogin={onSwitchToLogin} />);

    fill('New Person', 'new@example.com', 'a long enough password');
    await submit();

    expect(authApi.register).toHaveBeenCalledWith({
      name: 'New Person',
      email: 'new@example.com',
      password: 'a long enough password',
    });
    expect(screen.getByRole('heading', { name: 'Thanks for registering' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(PENDING);
    expect(screen.queryByRole('button', { name: 'Create Account' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });

  it('rejects a password shorter than 12 characters without calling the API', async () => {
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '12');
    fill('New Person', 'new@example.com', 'short pass');
    // Submit the form directly: jsdom would otherwise block it on the minLength constraint.
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).closest('form')!);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('at least 12 characters');
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('shows the API error and keeps the form when registration fails', async () => {
    authApi.register.mockRejectedValue(new ApiError(400, 'Password is too common'));
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    fill('New Person', 'new@example.com', 'a long enough password');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Password is too common');
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
