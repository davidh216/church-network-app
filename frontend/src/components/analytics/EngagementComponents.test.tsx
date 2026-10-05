import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EngagementComponents from './EngagementComponents';

describe('EngagementComponents', () => {
  it('lists the three components with rounded scores, weights and help text', () => {
    render(
      <EngagementComponents
        title="Score breakdown"
        headingLevel="h3"
        scores={{ attendanceScore: 66.6, communityScore: 60, communicationScore: 50 }}
      />,
    );
    const section = screen.getByRole('region', { name: 'Score breakdown' });
    expect(
      within(section).getByRole('heading', { level: 3, name: 'Score breakdown' }),
    ).toBeTruthy();
    const terms = within(section)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual([
      'Attendance (60% of the score)',
      'Community (20% of the score)',
      'Communication (20% of the score)',
    ]);
    const values = within(section)
      .getAllByRole('definition')
      .map((d) => d.textContent ?? '');
    expect(values[0]).toMatch(/^67\/100/);
    expect(values[1]).toMatch(/^60\/100.*one scores 60/);
    expect(values[2]).toMatch(/^50\/100.*50 when there were neither/);
    expect(
      within(section).getByText(/60% attendance, 20% community and 20% communication/),
    ).toBeTruthy();
  });
});
