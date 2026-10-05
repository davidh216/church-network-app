import { describe, expect, it } from 'vitest';
import { engagementScoreClass } from './display';

describe('analytics display helpers', () => {
  it('colours engagement scores at 80, 60 and 40', () => {
    expect(engagementScoreClass(80)).toContain('green');
    expect(engagementScoreClass(60)).toContain('blue');
    expect(engagementScoreClass(40)).toContain('yellow');
    expect(engagementScoreClass(39)).toContain('red');
  });
});
