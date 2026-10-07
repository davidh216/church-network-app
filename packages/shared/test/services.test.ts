import { describe, expect, it } from 'vitest';
import {
  createServiceInput,
  DEFAULT_SERVICE_PAGE_SIZE,
  DATE_MESSAGE,
  listServicesQuery,
  markAttendanceInput,
  MAX_ATTENDANCE_BATCH,
  memberAttendanceQuery,
  SERVICE_DATE_RANGE_MESSAGE,
  updateServiceInput,
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

  it('takes only years 1900 to 2100 inclusive, with one clear message', () => {
    const issues = (r: { error?: { issues: { message: string }[] } }) =>
      r.error?.issues.map((issue) => issue.message);
    for (const date of ['1900-01-01', '2026-10-04', '2100-12-31'])
      expect(createServiceInput.safeParse({ date }).success).toBe(true);
    for (const date of ['0000-01-01', '0026-10-04', '1899-12-31', '2101-01-01', '9999-12-31']) {
      expect(issues(createServiceInput.safeParse({ date }))).toEqual([SERVICE_DATE_RANGE_MESSAGE]);
      expect(issues(updateServiceInput.safeParse({ date }))).toEqual([SERVICE_DATE_RANGE_MESSAGE]);
    }
    expect(SERVICE_DATE_RANGE_MESSAGE).toBe('Enter a date between 1900 and 2100');
    expect(listServicesQuery.safeParse({ from: '1899-12-31' }).success).toBe(false);
    // A value that is not a date gets only the date message.
    expect(issues(createServiceInput.safeParse({ date: 'soon' }))).toEqual([DATE_MESSAGE]);
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
