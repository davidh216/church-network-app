import { describe, expect, it } from 'vitest';
import { engagementClass, formatStage, initials, riskDotClass, stageClass } from './display';

describe('member display helpers', () => {
  it('builds initials from each word and ignores extra spaces', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('  grace   hopper ')).toBe('GH');
    expect(initials('')).toBe('');
  });

  it('formats every underscore in a stage', () => {
    expect(formatStage('core_member')).toBe('core member');
    expect(formatStage('a_b_c')).toBe('a b c');
  });

  it('colours stages, with red for inactive and unknown stages', () => {
    expect(stageClass('leader')).toContain('purple');
    expect(stageClass('at_risk')).toContain('orange');
    expect(stageClass('inactive')).toContain('red');
    expect(stageClass('something_else')).toContain('red');
  });

  it('colours engagement scores at the 80 and 50 thresholds', () => {
    expect(engagementClass(80)).toContain('green');
    expect(engagementClass(79)).toContain('yellow');
    expect(engagementClass(50)).toContain('yellow');
    expect(engagementClass(49)).toContain('red');
  });

  it('colours risk dots', () => {
    expect(riskDotClass('low')).toContain('green');
    expect(riskDotClass('medium')).toContain('yellow');
    expect(riskDotClass('high')).toContain('red');
  });
});
