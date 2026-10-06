import { describe, expect, it } from 'vitest';
import {
  attendanceBody,
  changedServiceFields,
  currentMonth,
  hasUnsavedMarks,
  markDraft,
  sharedNames,
  withoutSaved,
  defaultServiceDate,
  monthBounds,
  monthTitle,
  serviceName,
  serviceTitle,
  shiftMonth,
} from './services';

const member = (id: string, present: boolean, recorded: boolean) => ({
  user: { id, name: id, email: `${id}@example.com`, avatar: null },
  present,
  recorded,
});

describe('months', () => {
  it('reads the local month and moves across year ends', () => {
    expect(currentMonth(new Date(2026, 9, 5, 23, 30))).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-03', 0)).toBe('2026-03');
  });

  it('gives inclusive bounds, leap years included', () => {
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(() => monthBounds('2026-1')).toThrow('Not a month');
  });

  it('names the month and picks a default date', () => {
    expect(monthTitle('2026-10')).toMatch(/2026/);
    const now = new Date(2026, 9, 5);
    expect(defaultServiceDate('2026-10', now)).toBe('2026-10-05');
    expect(defaultServiceDate('2026-08', now)).toBe('2026-08-01');
  });
});

describe('service names', () => {
  it('uses the title and the type label', () => {
    expect(serviceTitle({ title: null, type: 'bible_study' })).toBe('Bible Study');
    expect(serviceTitle({ title: 'Harvest', type: 'sunday_service' })).toBe(
      'Harvest (Sunday Service)',
    );
    expect(serviceName({ title: null, type: 'sunday_service', date: '2026-10-04' })).toMatch(
      /^Sunday Service on .*2026/,
    );
  });
});

describe('changedServiceFields', () => {
  const stored = {
    date: '2026-10-04',
    type: 'sunday_service' as const,
    title: 'Harvest',
    notes: null,
  };
  it('keeps only the changed fields, a cleared one as null', () => {
    expect(changedServiceFields(stored, { ...stored })).toEqual({});
    expect(changedServiceFields(stored, { ...stored, title: null, notes: 'Bring food' })).toEqual({
      title: null,
      notes: 'Bring food',
    });
    expect(
      changedServiceFields(stored, { date: '2026-10-11', type: 'bible_study', title: 'Harvest' }),
    ).toEqual({ date: '2026-10-11', type: 'bible_study' });
  });
});

describe('attendance draft', () => {
  const members = [
    member('a', true, true),
    member('b', false, false),
    member('c', false, true),
    member('d', true, true),
  ];

  it('sends only marks that differ from the server sheet', () => {
    expect(attendanceBody(members, new Map())).toEqual({ present: [], absent: [] });
    const draft = markDraft(new Map(), ['a', 'b', 'c', 'd'], true);
    expect(attendanceBody(members, draft)).toEqual({ present: ['b', 'c'], absent: [] });
    const cleared = markDraft(draft, ['a', 'b'], false);
    // b was never recorded and is unticked again: not sent, so no absence row appears.
    expect(attendanceBody(members, cleared)).toEqual({ present: ['c'], absent: ['a'] });
    expect(hasUnsavedMarks(members, cleared)).toBe(true);
    expect(hasUnsavedMarks(members, markDraft(new Map(), ['a'], true))).toBe(false);
    // A mark for someone no longer on the sheet is ignored.
    expect(attendanceBody(members, markDraft(new Map(), ['zz'], true)).present).toEqual([]);
  });

  it('drops the saved marks and keeps the ones made during the save', () => {
    const submitted = markDraft(new Map(), ['b', 'c'], true);
    const during = markDraft(markDraft(submitted, ['c'], false), ['d'], false);
    expect([...withoutSaved(during, submitted)]).toEqual([
      ['c', false],
      ['d', false],
    ]);
    expect(withoutSaved(submitted, submitted).size).toBe(0);
  });

  it('finds names held by more than one member, ignoring case', () => {
    const same = [member('x', true, true), member('y', true, true)];
    same[1]!.user.name = ' X ';
    expect(sharedNames(same)).toEqual(new Set(['x']));
    expect(sharedNames(members).size).toBe(0);
  });
});
