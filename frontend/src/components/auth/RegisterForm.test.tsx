import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCommonPassword } from '@embrace/shared';
import RegisterForm from '@/components/auth/RegisterForm';
import { ApiError } from '@/lib/api/client';
import { render, settle } from '@/test/render';

const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);

const PENDING =
  'Registration received. An administrator will review your account before you can sign in.';

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

  it('rejects a password shorter than 12 characters inline without calling the API', async () => {
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '12');
    fill('New Person', 'new@example.com', 'short pass');
    await submit();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Password must be at least 12 characters',
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('applies the shared common-password rule', async () => {
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    expect(isCommonPassword('1qaz2wsx3edc')).toBe(true);
    fill('New Person', 'new@example.com', '1qaz2wsx3edc');
    await submit();
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'This password is too common',
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('flags a malformed email inline and leaves valid fields unmarked', async () => {
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    fill('New Person', 'not-an-email', 'a long enough password');
    await submit();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Full name')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('sends the trimmed name from the schema output', async () => {
    authApi.register.mockResolvedValue({ success: true, message: PENDING, pendingApproval: true });
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    fill('  New Person  ', 'new@example.com', 'a long enough password');
    await submit();
    expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Person' }));
  });

  it('shows an API field error inline', async () => {
    authApi.register.mockRejectedValue(
      new ApiError(400, 'Invalid request', 'VALIDATION', { email: ['Email already registered'] }),
    );
    await render(<RegisterForm onSwitchToLogin={() => undefined} />);
    fill('New Person', 'new@example.com', 'a long enough password');
    await submit();
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email already registered');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
