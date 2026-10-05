import { describe, expect, it } from 'vitest';
import {
  createServiceInput,
  DEFAULT_SERVICE_PAGE_SIZE,
  listServicesQuery,
  markAttendanceInput,
  MAX_ATTENDANCE_BATCH,
  memberAttendanceQuery,
} from '../src';

const ID_A = 'cka1b2c3d4e5f6g7h8i9j0k1l';
const ID_B = 'ckb1b2c3d4e5f6g7h8i9j0k1l';

describe('service schemas', () => {
  it('takes a calendar date and defaults the type to a Sunday service', () => {
    expect(createServiceInput.parse({ date: '2026-09-06', title: ' ' })).toEqual({
      date: '2026-09-06',
      type: 'sunday_service',
      title: null,
    });
    expect(createServiceInput.safeParse({ date: '2026-09-06T10:00:00Z' }).success).toBe(false);
    expect(createServiceInput.safeParse({ date: '2026-02-30' }).success).toBe(false);
  });

  it('pages the list and rejects a backwards date range', () => {
    expect(listServicesQuery.parse({})).toEqual({ page: 1, pageSize: DEFAULT_SERVICE_PAGE_SIZE });
    expect(listServicesQuery.safeParse({ from: '2026-09-02', to: '2026-09-01' }).success).toBe(
      false,
    );
  });

  it('marks members present or absent, never both, within the batch limit', () => {
    expect(markAttendanceInput.parse({ present: [ID_A] })).toEqual({ present: [ID_A], absent: [] });
    expect(markAttendanceInput.safeParse({ present: [ID_A], absent: [ID_A] }).success).toBe(false);
    expect(markAttendanceInput.safeParse({ present: ['x'] }).success).toBe(false);
    const many = Array.from({ length: MAX_ATTENDANCE_BATCH }, () => ID_A);
    expect(markAttendanceInput.safeParse({ present: many, absent: [ID_B] }).success).toBe(false);
  });

  it('reads the summary window and the scoring types from a query string', () => {
    expect(memberAttendanceQuery.parse({})).toEqual({ months: 12, types: ['sunday_service'] });
    expect(
      memberAttendanceQuery.parse({ months: '3', types: 'bible_study,sunday_service' }),
    ).toEqual({ months: 3, types: ['sunday_service', 'bible_study'] });
    expect(memberAttendanceQuery.parse({ types: ['other', 'other'] }).types).toEqual(['other']);
    expect(memberAttendanceQuery.safeParse({ types: 'youth' }).success).toBe(false);
    expect(memberAttendanceQuery.safeParse({ months: '61' }).success).toBe(false);
  });
});
