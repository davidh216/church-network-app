import { describe, expect, it } from 'vitest';
import {
  MAX_METADATA_DEPTH,
  METADATA_INVALID_CHARACTER,
  METADATA_TOO_DEEP,
  createMediaInput,
  createSavedSearchInput,
  metadataProblem,
  recordActivityInput,
  recordInteractionInput,
  updateUserInput,
} from '../src';

const NUL = '\u0000';

// Nests `levels` objects: levels = 1 is { d: 1 }.
function nested(levels: number): Record<string, unknown> {
  let value: unknown = 1;
  for (let i = 0; i < levels; i += 1) value = { d: value };
  return value as Record<string, unknown>;
}

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('U+0000 in free text', () => {
  it('is rejected in required and optional text fields', () => {
    expect(messages(updateUserInput.safeParse({ name: `A${NUL}` }))).toEqual([
      'Name contains an invalid character',
    ]);
    expect(updateUserInput.safeParse({ bio: `x${NUL}` }).success).toBe(false);
    expect(updateUserInput.safeParse({ bio: 'x' }).success).toBe(true);
  });

  it('is rejected in list entries', () => {
    expect(updateUserInput.safeParse({ interests: [`x${NUL}`] }).success).toBe(false);
    expect(updateUserInput.safeParse({ volunteerSkills: [`a${NUL}b`] }).success).toBe(false);
    const media = {
      title: 'Sermon',
      type: 'YOUTUBE_VIDEO',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    };
    expect(createMediaInput.safeParse({ ...media, tags: [`a${NUL}b`] }).success).toBe(false);
    expect(createMediaInput.safeParse({ ...media, tags: ['ab'] }).success).toBe(true);
  });

  it('is rejected in saved-search names and condition values', () => {
    const condition = { field: 'name', operator: 'contains', value: 'a' };
    const ok = { name: 'Mine', query: { conditions: [condition], logic: 'AND' } };
    expect(createSavedSearchInput.safeParse(ok).success).toBe(true);
    expect(createSavedSearchInput.safeParse({ ...ok, name: `M${NUL}` }).success).toBe(false);
    expect(
      createSavedSearchInput.safeParse({
        ...ok,
        query: { ...ok.query, conditions: [{ ...condition, value: `a${NUL}` }] },
      }).success,
    ).toBe(false);
  });
});

describe('metadata', () => {
  it(`accepts up to ${MAX_METADATA_DEPTH} levels and rejects deeper nesting`, () => {
    expect(metadataProblem(nested(MAX_METADATA_DEPTH))).toBeNull();
    expect(metadataProblem(nested(MAX_METADATA_DEPTH + 1))).toBe(METADATA_TOO_DEEP);
    expect(metadataProblem({ a: [[[1]]] })).toBeNull();
    // Arrays count as levels too: the object plus 32 arrays is 33 levels.
    let array: unknown = 1;
    for (let i = 0; i < MAX_METADATA_DEPTH; i += 1) array = [array];
    expect(metadataProblem({ a: array })).toBe(METADATA_TOO_DEEP);
  });

  it('walks very deep input without overflowing the stack', () => {
    expect(metadataProblem(nested(100_000))).toBe(METADATA_TOO_DEEP);
  });

  it('rejects U+0000 in keys and string values at any level', () => {
    expect(metadataProblem({ a: `x${NUL}` })).toBe(METADATA_INVALID_CHARACTER);
    expect(metadataProblem({ [`k${NUL}`]: 1 })).toBe(METADATA_INVALID_CHARACTER);
    expect(metadataProblem({ a: [{ b: ['ok', NUL] }] })).toBe(METADATA_INVALID_CHARACTER);
    expect(metadataProblem({ a: 'plain', b: [1, true, null] })).toBeNull();
  });

  it('reports the problem on the activity and interaction bodies', () => {
    const activity = { activityType: 'other', metadata: nested(MAX_METADATA_DEPTH + 1) };
    const result = recordActivityInput.safeParse(activity);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['metadata'],
      message: METADATA_TOO_DEEP,
    });
    const interaction = recordInteractionInput.safeParse({
      interactionType: 'note_added',
      channel: 'email',
      metadata: { a: NUL },
    });
    expect(messages(interaction)).toContain(METADATA_INVALID_CHARACTER);
    expect(
      recordActivityInput.safeParse({ activityType: 'other', metadata: { a: 1 } }).success,
    ).toBe(true);
  });
});

describe('lone UTF-16 surrogates in free text', () => {
  const HIGH = '\ud800';
  const LOW = '\udc00';
  const EMOJI = '\u{1F600}'; // a valid surrogate pair

  it('are rejected in required and optional text fields like U+0000', () => {
    expect(messages(updateUserInput.safeParse({ name: `A${HIGH}` }))).toEqual([
      'Name contains an invalid character',
    ]);
    expect(updateUserInput.safeParse({ bio: LOW }).success).toBe(false);
    expect(updateUserInput.safeParse({ bio: `${LOW}${HIGH}` }).success).toBe(false);
    expect(updateUserInput.safeParse({ name: `Ann ${EMOJI}`, bio: EMOJI }).success).toBe(true);
  });

  it('are rejected in list entries', () => {
    expect(updateUserInput.safeParse({ volunteerSkills: [HIGH] }).success).toBe(false);
    expect(updateUserInput.safeParse({ interests: [`a${LOW}`] }).success).toBe(false);
    expect(updateUserInput.safeParse({ interests: [`a${EMOJI}`] }).success).toBe(true);
  });

  it('are rejected in saved-search names and condition values', () => {
    const condition = { field: 'name', operator: 'contains', value: 'a' };
    const ok = { name: 'Mine', query: { conditions: [condition], logic: 'AND' } };
    expect(createSavedSearchInput.safeParse({ ...ok, name: `M${HIGH}` }).success).toBe(false);
    const bad = createSavedSearchInput.safeParse({
      ...ok,
      query: { ...ok.query, conditions: [{ ...condition, value: HIGH }] },
    });
    expect(messages(bad)).toEqual(['The value contains an invalid character']);
  });

  it('are rejected in metadata keys and string values at any level', () => {
    expect(metadataProblem({ a: HIGH })).toBe(METADATA_INVALID_CHARACTER);
    expect(metadataProblem({ [HIGH]: 1 })).toBe(METADATA_INVALID_CHARACTER);
    expect(metadataProblem({ a: [{ b: ['ok', `x${LOW}`] }] })).toBe(METADATA_INVALID_CHARACTER);
    expect(metadataProblem({ [EMOJI]: EMOJI })).toBeNull();
  });
});
