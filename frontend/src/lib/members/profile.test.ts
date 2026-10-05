import { describe, expect, it, vi } from 'vitest';
import {
  calculateAge,
  formatDate,
  formatDateTime,
  impactClass,
  interactionIcon,
  membershipDuration,
  milestoneIcon,
  priorityClass,
  profileDate,
  riskBadgeClass,
} from './profile';

describe('member profile helpers', () => {
  it('formats dates and says "Not set" without one', () => {
    expect(formatDate(undefined)).toBe('Not set');
    expect(formatDate(null)).toBe('Not set');
    expect(formatDate('2024-01-05T12:00:00')).toBe('January 5, 2024');
    expect(formatDateTime('')).toBe('Not set');
    expect(formatDateTime('2024-01-05T09:30:00')).toContain('Jan 5, 2024');
    expect(formatDate('garbage')).toBe('Not set');
  });

  it("uses the viewer's locale rather than en-US", () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString');
    profileDate('2024-01-05T12:00:00');
    expect(spy).toHaveBeenCalledWith(undefined, expect.any(Object));
    expect(profileDate(null)).toBeNull();
  });

  it('counts whole years of age, before and after the birthday', () => {
    const now = new Date(2024, 5, 15);
    expect(calculateAge(undefined, now)).toBeNull();
    expect(calculateAge('1990-06-15T00:00:00', now)).toBe(34);
    expect(calculateAge('1990-06-16T00:00:00', now)).toBe(33);
    expect(calculateAge('1990-07-01T00:00:00', now)).toBe(33);
  });

  it('describes the membership duration in years and months', () => {
    const now = new Date('2024-06-15T00:00:00Z');
    expect(membershipDuration(null, now)).toBe('Unknown');
    expect(membershipDuration('2024-01-15T00:00:00Z', now)).toBe('5 months');
    expect(membershipDuration('2022-03-01T00:00:00Z', now)).toBe('2 years, 3 months');
    expect(membershipDuration('2023-06-10T00:00:00Z', now)).toBe('1 year');
    expect(membershipDuration('2023-05-10T00:00:00Z', now)).toBe('1 year, 1 month');
    expect(membershipDuration('2024-06-01T00:00:00Z', now)).toBe('Less than a month');
    expect(membershipDuration('not a date', now)).toBe('Unknown');
  });

  it('maps icons and badge colours with defaults for unknown values', () => {
    expect(interactionIcon('call_made')).toBe('📞');
    expect(interactionIcon('other')).toBe('📋');
    expect(milestoneIcon('baptism')).toBe('✝️');
    expect(milestoneIcon('other')).toBe('🏆');
    expect(priorityClass('urgent')).toContain('red');
    expect(priorityClass('low')).toContain('gray');
    expect(impactClass('high')).toContain('purple');
    expect(impactClass('low')).toContain('gray');
    expect(riskBadgeClass('high')).toContain('red');
    expect(riskBadgeClass('medium')).toContain('yellow');
    expect(riskBadgeClass('low')).toContain('green');
  });
});
