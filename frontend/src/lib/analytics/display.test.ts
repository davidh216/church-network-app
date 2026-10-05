import { describe, expect, it } from 'vitest';
import { engagementScoreClass, riskColour, riskLabel, stageColour, stageLabel } from './display';

describe('analytics display helpers', () => {
  it('colours engagement scores at 80, 60 and 40', () => {
    expect(engagementScoreClass(80)).toContain('green');
    expect(engagementScoreClass(60)).toContain('blue');
    expect(engagementScoreClass(40)).toContain('yellow');
    expect(engagementScoreClass(39)).toContain('red');
  });

  it('colours stages and risk levels with a grey default', () => {
    expect(stageColour('inactive')).toContain('red');
    expect(stageColour('unknown')).toContain('gray');
    expect(riskColour('high')).toContain('red');
    expect(riskColour('unknown')).toContain('gray');
  });

  it('labels stages and risk levels', () => {
    expect(stageLabel('core_member')).toBe('Core Member');
    expect(riskLabel('medium')).toBe('Medium Risk');
  });
});
