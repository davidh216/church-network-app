import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_WEIGHTS } from '@embrace/shared';
import { ENGAGEMENT_COMPONENTS, ENGAGEMENT_SCORE_HELP, engagementScoreClass } from './display';

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

  it('takes the weights and the formula from the shared ENGAGEMENT_WEIGHTS', () => {
    const weights = Object.fromEntries(ENGAGEMENT_COMPONENTS.map((c) => [c.key, c.weight]));
    expect(weights).toEqual({
      attendanceScore: ENGAGEMENT_WEIGHTS.attendance * 100,
      communityScore: ENGAGEMENT_WEIGHTS.community * 100,
      communicationScore: ENGAGEMENT_WEIGHTS.communication * 100,
    });
    expect(ENGAGEMENT_SCORE_HELP).toBe(
      `Overall score: ${ENGAGEMENT_WEIGHTS.attendance * 100}% attendance, ` +
        `${ENGAGEMENT_WEIGHTS.community * 100}% community and ` +
        `${ENGAGEMENT_WEIGHTS.communication * 100}% communication, rounded.`,
    );
  });

  it('states the 6.1 communication rule for responses without asks and for neither', () => {
    const help = ENGAGEMENT_COMPONENTS.find((c) => c.key === 'communicationScore')?.help;
    expect(help).toMatch(/Responses over asks/);
    expect(help).toMatch(/100 when there were responses but no asks/);
    expect(help).toMatch(/50 when there were neither/);
  });
});
