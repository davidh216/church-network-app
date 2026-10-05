import { describe, expect, it } from 'vitest';
import { noticeHref, noticeMessage } from './notices';

describe('notices', () => {
  it('builds the dashboard URL for a notice', () => {
    expect(noticeHref('staff-only')).toBe('/?notice=staff-only');
  });

  it('maps known codes to their message and ignores anything else', () => {
    expect(noticeMessage('staff-only')).toBe('That page is only available to staff.');
    expect(noticeMessage('<b>hi</b>')).toBeNull();
    expect(noticeMessage('toString')).toBeNull();
    expect(noticeMessage(null)).toBeNull();
  });
});
