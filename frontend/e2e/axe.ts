import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Runs axe-core on the current page and fails on any `serious` or `critical` violation
 * (decision P2-5). The message lists each rule with the selectors that broke it.
 */
export async function expectNoSeriousA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const report = blocking.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(report, `axe violations on ${label}`).toEqual([]);
}
