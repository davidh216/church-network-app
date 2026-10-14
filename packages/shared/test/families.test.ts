import { describe, expect, it } from 'vitest';
import {
  createFamilyInput,
  FAMILY_SAME_PERSON,
  listFamiliesQuery,
  putFamilyMemberInput,
  setFamilyRelationshipInput,
  updateFamilyInput,
} from '../src';

const A = 'cuseraaaaaaaaaaaaaaaaaaaaa';
const B = 'cuserbbbbbbbbbbbbbbbbbbbbb';

describe('family schemas', () => {
  it('trims the name and address, storing blank address fields as null', () => {
    expect(
      createFamilyInput.parse({ familyName: ' Doe ', address: ' 1 Main St ', city: ' ' }),
    ).toEqual({ familyName: 'Doe', address: '1 Main St', city: null });
    expect(createFamilyInput.safeParse({ familyName: ' ' }).success).toBe(false);
    expect(createFamilyInput.safeParse({ familyName: 'x'.repeat(101) }).success).toBe(false);
    expect(createFamilyInput.safeParse({ familyName: 'A', zipCode: 'x'.repeat(21) }).success).toBe(
      false,
    );
    expect(createFamilyInput.safeParse({ familyName: 'A', headOfFamilyId: 'nope' }).success).toBe(
      false,
    );
  });

  it('takes any subset on update; a null head clears it', () => {
    expect(updateFamilyInput.parse({ headOfFamilyId: null })).toEqual({ headOfFamilyId: null });
    expect(updateFamilyInput.parse({ country: '' })).toEqual({ country: null });
    expect(updateFamilyInput.parse({})).toEqual({});
  });

  it('pages the list with a blank search as none', () => {
    expect(listFamiliesQuery.parse({ q: ' ', page: '2' })).toEqual({ page: 2, pageSize: 25 });
    expect(listFamiliesQuery.safeParse({ pageSize: '101' }).success).toBe(false);
  });

  it('accepts a missing membership body or a move flag', () => {
    expect(putFamilyMemberInput.parse(undefined)).toBeUndefined();
    expect(putFamilyMemberInput.parse({ move: true })).toEqual({ move: true });
    expect(putFamilyMemberInput.safeParse({ move: 'yes' }).success).toBe(false);
  });

  it('needs two different people and a known relationship type', () => {
    expect(
      setFamilyRelationshipInput.parse({ userId: A, relatedUserId: B, type: 'parent' }),
    ).toEqual({ userId: A, relatedUserId: B, type: 'parent' });
    const same = setFamilyRelationshipInput.safeParse({
      userId: A,
      relatedUserId: A,
      type: 'spouse',
    });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]).toMatchObject({
      path: ['relatedUserId'],
      message: FAMILY_SAME_PERSON,
    });
    expect(
      setFamilyRelationshipInput.safeParse({ userId: A, relatedUserId: B, type: 'cousin' }).success,
    ).toBe(false);
  });
});
