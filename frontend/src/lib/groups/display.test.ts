import { describe, expect, it } from 'vitest';
import { groupRoleLabel, groupTypeLabel, leadersText, scheduleText } from './display';

describe('group display', () => {
  it('labels roles and types', () => {
    expect(groupRoleLabel('co_leader')).toBe('Co-leader');
    expect(groupTypeLabel('service_team')).toBe('Service Team');
  });

  it('joins the schedule and the leaders', () => {
    expect(scheduleText({ meetingDay: 'Wednesdays', meetingTime: '19:30' })).toBe(
      'Wednesdays at 19:30',
    );
    expect(scheduleText({ meetingDay: null, meetingTime: '19:30' })).toBe('19:30');
    expect(scheduleText({ meetingDay: null, meetingTime: null })).toBeNull();
    expect(
      leadersText([
        { name: 'Ann', role: 'leader' },
        { name: 'Ben', role: 'co_leader' },
      ]),
    ).toBe('Ann (Leader), Ben (Co-leader)');
    expect(leadersText([])).toBeNull();
  });
});
