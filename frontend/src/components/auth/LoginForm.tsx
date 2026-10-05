'use client';

import { useState } from 'react';
import { loginInput } from '@embrace/shared';
import FieldError from '@/components/ui/FieldError';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '@/lib/forms/validate';
import type { User } from '@/types/domain';

interface LoginFormProps {
  onSuccess: (user: User) => void;
  onSwitchToRegister: () => void;
}

const FIELDS = ['email', 'password'] as const;

export default function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same schema as POST /api/auth/login, so a malformed email is caught before the request.
    const checked = validateForm(loginInput, { email, password });
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setError(checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    setFieldErrors({});
    setError('');
    setLoading(true);

    try {
      onSuccess(await login(checked.data.email, checked.data.password));
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Login failed');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Welcome Back</h2>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            {...fieldA11y('email', fieldErrors.email)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="your@email.com"
          />
          <FieldError fieldId="email" message={fieldErrors.email} />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            id="password"
            {...fieldA11y('password', fieldErrors.password)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="Your password"
          />
          <FieldError fieldId="password" message={fieldErrors.password} />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          Register here
        </button>
      </p>
    </div>
  );
}
