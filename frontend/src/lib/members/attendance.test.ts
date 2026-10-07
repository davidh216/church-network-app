import { describe, expect, it } from 'vitest';
import { attendanceRate, serviceTypesLabel } from './attendance';

describe('attendance helpers', () => {
  it('labels one or several service types from the shared labels', () => {
    expect(serviceTypesLabel(['sunday_service'])).toBe('Sunday Service');
    expect(serviceTypesLabel(['sunday_service', 'bible_study'])).toBe(
      'Sunday Service and Bible Study',
    );
    expect(serviceTypesLabel(['sunday_service', 'bible_study', 'other'])).toBe(
      'Sunday Service, Bible Study and Other',
    );
  });

  it('rounds the attendance rate and gives null without services', () => {
    expect(attendanceRate({ attendedCount: 2, serviceCount: 3 })).toBe(67);
    expect(attendanceRate({ attendedCount: 0, serviceCount: 0 })).toBeNull();
  });
});
