import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from '../src/config/env';

describe('parseTrustProxy (TRUST_PROXY)', () => {
  it('passes an integer as a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('maps true and false to booleans', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('keeps an address list as a string', () => {
    expect(parseTrustProxy('loopback, uniquelocal')).toBe('loopback, uniquelocal');
    expect(parseTrustProxy('10.0.0.0/8,127.0.0.1')).toBe('10.0.0.0/8,127.0.0.1');
  });
});
