import { describe, expect, it } from 'vitest';
import { changedLists, changedNames, nameParts, profileLists } from './memberForm';

describe('member form lists', () => {
  it('starts from the stored lists, or empty ones', () => {
    expect(profileLists(null)).toEqual({ volunteerSkills: [], interests: [] });
    expect(profileLists({ volunteerSkills: ['Music'] })).toEqual({
      volunteerSkills: ['Music'],
      interests: [],
    });
  });

  it('sends only the lists that changed', () => {
    const member = { volunteerSkills: ['Music'], interests: ['Hiking'] };
    expect(changedLists(member, { volunteerSkills: ['Music'], interests: ['Hiking'] })).toEqual({});
    expect(changedLists(member, { volunteerSkills: [], interests: ['Hiking'] })).toEqual({
      volunteerSkills: [],
    });
    // A row without the lists and an untouched form send nothing (never clears them).
    expect(changedLists({}, { volunteerSkills: [], interests: [] })).toEqual({});
    expect(changedLists({}, { volunteerSkills: [], interests: ['Art'] })).toEqual({
      interests: ['Art'],
    });
  });

  it('reads the stored name parts and sends only the ones that changed', () => {
    expect(nameParts(null)).toEqual({ firstName: '', lastName: '' });
    expect(nameParts({ firstName: 'Ada', lastName: null })).toEqual({
      firstName: 'Ada',
      lastName: '',
    });
    const member = { firstName: 'Ada', lastName: 'Lovelace' };
    expect(changedNames(member, { firstName: ' Ada ', lastName: 'Lovelace' })).toEqual({});
    expect(changedNames(member, { firstName: 'Ada', lastName: '' })).toEqual({ lastName: '' });
    expect(changedNames({}, { firstName: '', lastName: '' })).toEqual({});
    expect(changedNames({}, { firstName: 'Grace', lastName: '' })).toEqual({ firstName: 'Grace' });
  });
});
