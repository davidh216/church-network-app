import { describe, expect, it } from 'vitest';
import { addressText, relationSentence, relationshipLabel } from './display';

describe('family display', () => {
  it('labels relationships and says them as sentences', () => {
    expect(relationshipLabel('grandchild')).toBe('Grandchild');
    expect(relationSentence('Ann', 'parent', 'Ben')).toBe('Ann is the parent of Ben');
    expect(relationSentence('Ann', 'other', 'Ben')).toBe('Ann is related to Ben');
  });

  it('joins the address parts that are set', () => {
    const empty = { address: null, city: null, state: null, zipCode: null, country: null };
    expect(addressText(empty)).toBeNull();
    expect(
      addressText({
        ...empty,
        address: '1 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
      }),
    ).toBe('1 Main St, Springfield, IL 62701');
    expect(addressText({ ...empty, country: 'USA' })).toBe('USA');
  });
});
