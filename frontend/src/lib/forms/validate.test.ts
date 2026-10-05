import { describe, expect, it } from 'vitest';
import { createUserInput, loginInput } from '@embrace/shared';
import { ApiError } from '@/lib/api/client';
import {
  apiErrorsFor,
  errorId,
  fieldA11y,
  FORM_ERROR_KEY,
  issuesToFieldErrors,
  validateForm,
} from './validate';

describe('validateForm', () => {
  it('returns the schema output on success', () => {
    const result = validateForm(createUserInput, {
      name: ' Ann ',
      email: 'ann@example.com',
      password: 'a long temporary password',
      phone: '',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Ann',
        email: 'ann@example.com',
        password: 'a long temporary password',
        phone: null,
      },
    });
  });

  it('keeps the first message for each field', () => {
    const result = validateForm(loginInput, { email: 'nope', password: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'password']);
    expect(typeof result.errors.email).toBe('string');
  });
});

describe('issuesToFieldErrors', () => {
  it('keys whole-object issues as form errors and nested paths by their first segment', () => {
    expect(
      issuesToFieldErrors([
        { code: 'custom', path: [], message: 'Body must be an object', input: null },
        { code: 'custom', path: ['tags', 2], message: 'Tag too long', input: null },
        { code: 'custom', path: ['tags', 3], message: 'Second tag message', input: null },
      ]),
    ).toEqual({ [FORM_ERROR_KEY]: 'Body must be an object', tags: 'Tag too long' });
  });
});

describe('apiErrorsFor', () => {
  it('turns validation details for shown fields into inline errors only', () => {
    const err = new ApiError(400, 'Invalid request', 'VALIDATION', { email: ['Taken', 'Other'] });
    expect(apiErrorsFor(err, ['email'], 'Failed')).toEqual({
      fieldErrors: { email: 'Taken' },
      message: '',
    });
  });

  it('keeps the general message when a detail names a field the form does not show', () => {
    const err = new ApiError(400, 'phone: Too long', 'VALIDATION', {
      email: ['Taken'],
      phone: ['Too long'],
    });
    expect(apiErrorsFor(err, ['email'], 'Failed')).toEqual({
      fieldErrors: { email: 'Taken' },
      message: 'phone: Too long',
    });
  });

  it('uses the error message, or the fallback, for other failures', () => {
    expect(apiErrorsFor(new ApiError(403, 'Forbidden'), ['email'], 'Failed').message).toBe(
      'Forbidden',
    );
    expect(apiErrorsFor(null, ['email'], 'Failed')).toEqual({ fieldErrors: {}, message: 'Failed' });
  });
});

describe('fieldA11y', () => {
  it('links an invalid control to its error message', () => {
    expect(fieldA11y('x', 'Bad')).toEqual({
      'aria-invalid': true,
      'aria-describedby': errorId('x'),
    });
    expect(fieldA11y('x', undefined)).toEqual({});
  });
});
