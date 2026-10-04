'use client';

import { useState } from 'react';
import { register } from '@/lib/api/auth';
import { getErrorMessage } from '@/lib/errors';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

// Matches the API's password policy (Phase 1 item 1.6: 12 to 128 characters).
const MIN_PASSWORD_LENGTH = 12;

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    setLoading(true);
    try {
      const response = await register({ email, password, name });
      setSubmittedMessage(response.message);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (submittedMessage) {
    return (
      <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-bold mb-4">Thanks for registering</h2>
        <p role="status" className="text-gray-700 mb-6">{submittedMessage}</p>
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
        <div role="alert" className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="register-name" className="sr-only">Full name</label>
          <input
            id="register-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Full Name"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="register-email" className="sr-only">Email</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Email"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="register-password" className="sr-only">Password</label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder={`Password (minimum ${MIN_PASSWORD_LENGTH} characters)`}
            disabled={loading}
          />
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
