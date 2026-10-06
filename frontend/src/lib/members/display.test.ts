import { describe, expect, it } from 'vitest';
import {
  engagementClass,
  initials,
  riskClass,
  riskDotClass,
  riskLabel,
  stageClass,
  stageLabel,
} from './display';

describe('member display helpers', () => {
  it('builds initials from each word and ignores extra spaces', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('  grace   hopper ')).toBe('GH');
    expect(initials('')).toBe('');
  });

  it('uses the first and last names for initials when both are set', () => {
    expect(initials({ name: 'Ada King', firstName: 'augusta', lastName: 'Lovelace' })).toBe('AL');
    expect(initials({ name: 'Ada King', firstName: 'Augusta', lastName: null })).toBe('AK');
    expect(initials({ name: 'Ada King', firstName: ' ', lastName: 'Lovelace' })).toBe('AK');
    expect(initials({ name: 'Grace Hopper' })).toBe('GH');
  });

  it('labels stages and risk levels in title case', () => {
    expect(stageLabel('core_member')).toBe('Core Member');
    expect(stageLabel('a_b_c')).toBe('A B C');
    expect(riskLabel('medium')).toBe('Medium Risk');
  });

  it('colours stages, with red for inactive and grey for unknown stages', () => {
    expect(stageClass('leader')).toContain('purple');
    expect(stageClass('at_risk')).toContain('orange');
    expect(stageClass('inactive')).toContain('red');
    expect(stageClass('something_else')).toContain('gray');
  });

  it('colours risk badges and dots', () => {
    expect(riskClass('low')).toContain('green');
    expect(riskClass('high')).toContain('red');
    expect(riskClass('unknown')).toContain('gray');
    expect(riskDotClass('low')).toContain('green');
    expect(riskDotClass('medium')).toContain('yellow');
    expect(riskDotClass('high')).toContain('red');
  });

  it('colours engagement scores at the 80 and 50 thresholds', () => {
    expect(engagementClass(80)).toContain('green');
    expect(engagementClass(79)).toContain('yellow');
    expect(engagementClass(50)).toContain('yellow');
    expect(engagementClass(49)).toContain('red');
  });
});
