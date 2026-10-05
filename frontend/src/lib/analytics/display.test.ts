import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_COMPONENTS, engagementScoreClass } from './display';

describe('analytics display helpers', () => {
  it('colours engagement scores at 80, 60 and 40', () => {
    expect(engagementScoreClass(80)).toContain('green');
    expect(engagementScoreClass(60)).toContain('blue');
    expect(engagementScoreClass(40)).toContain('yellow');
    expect(engagementScoreClass(39)).toContain('red');
  });

  it('describes the three engagement components with weights that add up to 100', () => {
    expect(ENGAGEMENT_COMPONENTS.map((c) => c.key)).toEqual([
      'attendanceScore',
      'communityScore',
      'communicationScore',
    ]);
    expect(ENGAGEMENT_COMPONENTS.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });
});
