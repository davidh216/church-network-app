import { describe, expect, it } from 'vitest';
import {
  attendanceBody,
  currentMonth,
  defaultServiceDate,
  monthBounds,
  monthTitle,
  presentIds,
  serviceName,
  serviceTitle,
  shiftMonth,
} from './services';

const member = (id: string, present: boolean, recorded: boolean) => ({
  user: { id, name: id, avatar: null },
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

describe('attendanceBody', () => {
  it('sends checked members present and only previously recorded ones absent', () => {
    const members = [
      member('a', true, true),
      member('b', false, false),
      member('c', false, true),
      member('d', true, true),
    ];
    expect(presentIds(members)).toEqual(new Set(['a', 'd']));
    expect(attendanceBody(members, new Set(['a', 'b']))).toEqual({
      present: ['a', 'b'],
      absent: ['c', 'd'],
    });
    expect(attendanceBody(members, new Set())).toEqual({ present: [], absent: ['a', 'c', 'd'] });
  });
});
