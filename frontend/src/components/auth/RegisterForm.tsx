'use client';

import { useState } from 'react';
import { MIN_PASSWORD_LENGTH, registerInput } from '@embrace/shared';
import FieldError from '@/components/ui/FieldError';
import { register } from '@/lib/api/auth';
import {
  apiErrorsFor,
  fieldA11y,
  FORM_ERROR_KEY,
  validateForm,
  type FieldErrors,
} from '@/lib/forms/validate';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

const FIELDS = ['name', 'email', 'password'] as const;

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    // The API's own schema: same rules (password policy included) and the same messages.
    const checked = validateForm(registerInput, { name, email, password });
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      setError(checked.errors[FORM_ERROR_KEY] ?? '');
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const response = await register(checked.data);
      setSubmittedMessage(response.message);
    } catch (err: unknown) {
      const failed = apiErrorsFor(err, FIELDS, 'Registration failed. Please try again.');
      setFieldErrors(failed.fieldErrors);
      setError(failed.message);
    } finally {
      setLoading(false);
    }
  };

  if (submittedMessage) {
    return (
      <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-bold mb-4">Thanks for registering</h2>
        <p role="status" className="text-gray-700 mb-6">
          {submittedMessage}
        </p>
        <button type="button" onClick={onSwitchToLogin} className="text-blue-600 font-medium">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-6">Join Our Church</h2>

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
          <label htmlFor="register-name" className="sr-only">
            Full name
          </label>
          <input
            id="register-name"
            {...fieldA11y('register-name', fieldErrors.name)}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Full Name"
            disabled={loading}
          />
          <FieldError fieldId="register-name" message={fieldErrors.name} />
        </div>

        <div>
          <label htmlFor="register-email" className="sr-only">
            Email
          </label>
          <input
            id="register-email"
            {...fieldA11y('register-email', fieldErrors.email)}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Email"
            disabled={loading}
          />
          <FieldError fieldId="register-email" message={fieldErrors.email} />
        </div>

        <div>
          <label htmlFor="register-password" className="sr-only">
            Password
          </label>
          <input
            id="register-password"
            {...fieldA11y('register-password', fieldErrors.password)}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder={`Password (minimum ${MIN_PASSWORD_LENGTH} characters)`}
            disabled={loading}
          />
          <FieldError fieldId="register-password" message={fieldErrors.password} />
        </div>

        <p className="text-xs text-gray-500">
          New accounts are reviewed by a church administrator before they can sign in.
        </p>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
          } text-white`}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin} className="text-blue-600">
          Sign in here
        </button>
      </p>
    </div>
  );
}
