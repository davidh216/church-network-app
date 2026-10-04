import type { ApiEnvelope, RegisterResult, User } from '../../types/domain';
import { apiFetch } from './client';

/** Signs in; the API sets the httpOnly session cookie. */
export async function login(email: string, password: string): Promise<User> {
  const data = await apiFetch<ApiEnvelope<{ user: User }>>('/auth/login', {
    method: 'POST',
    json: { email, password },
  });
  return data.user;
}

/** Clears the session cookie. */
export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
}

/** The signed-in user; throws an ApiError with status 401 when there is no session. */
export async function me(): Promise<User> {
  const data = await apiFetch<ApiEnvelope<{ user: User }>>('/auth/me');
  return data.user;
}

/** Creates an account that an administrator must approve. Does not sign in. */
export async function register(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
}): Promise<RegisterResult> {
  return apiFetch<ApiEnvelope<RegisterResult>>('/auth/register', { method: 'POST', json: input });
}
