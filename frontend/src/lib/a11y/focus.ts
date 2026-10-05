/** Elements a keyboard user can Tab to, in a form `querySelectorAll` understands. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The tabbable descendants of `root` in document order (hidden and inert ones skipped). */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.closest('[inert]') && !el.hasAttribute('hidden') && el.getAttribute('tabindex') !== '-1',
  );
}

/**
 * Where Tab (or Shift+Tab) should move focus to keep it inside `root`, or null when the
 * browser's default move already stays inside.
 */
export function trapTarget(
  root: HTMLElement,
  active: Element | null,
  backwards: boolean,
): HTMLElement | null {
  const items = focusableWithin(root);
  if (items.length === 0) return root;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (!active || !root.contains(active) || active === root) return backwards ? last : first;
  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;
  return null;
}
