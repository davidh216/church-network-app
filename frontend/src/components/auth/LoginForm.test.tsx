import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from '@/components/auth/LoginForm';
import { ApiError } from '@/lib/api/client';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';

const auth = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await settle();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LoginForm', () => {
  it('signs in with valid input and reports the user', async () => {
    const user = makeUser(['member']);
    auth.login.mockResolvedValue(user);
    const onSuccess = vi.fn();
    await render(<LoginForm onSuccess={onSuccess} onSwitchToRegister={() => undefined} />);
    fill('ann@example.com', 'any password');
    await submit();
    expect(auth.login).toHaveBeenCalledWith('ann@example.com', 'any password');
    expect(onSuccess).toHaveBeenCalledWith(user);
  });

  it('flags a malformed email and an empty password inline without calling the API', async () => {
    await render(<LoginForm onSuccess={() => undefined} onSwitchToRegister={() => undefined} />);
    fill('not-an-email', '');
    await submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/.+/);
  });

  it('shows the API error as an alert when the credentials are wrong', async () => {
    auth.login.mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    await render(<LoginForm onSuccess={() => undefined} onSwitchToRegister={() => undefined} />);
    fill('ann@example.com', 'wrong password');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });
});
