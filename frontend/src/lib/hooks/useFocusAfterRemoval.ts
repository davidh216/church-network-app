import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps focus on the page when the row holding the focused control leaves a list (a member
 * removed from a roster, a group archived out of the Active filter). Call `expectRemoval(id)`
 * before the change; once `ids` no longer includes it, focus moves to the registered control of
 * the row that followed it, else to `heading` (which needs `tabIndex={-1}`). `cancel()` drops
 * the plan when the change fails.
 */
export function useFocusAfterRemoval(
  ids: readonly string[],
  heading: RefObject<HTMLElement | null>,
) {
  const controls = useRef(new Map<string, HTMLElement>());
  const plan = useRef<{ removed: string; next: string | null } | null>(null);

  useEffect(() => {
    const current = plan.current;
    if (!current || ids.includes(current.removed)) return;
    plan.current = null;
    const next =
      current.next && ids.includes(current.next) ? controls.current.get(current.next) : undefined;
    (next ?? heading.current)?.focus();
  });

  return {
    /** The ref callback for the control a row offers focus to. */
    control: (id: string) => (el: HTMLElement | null) => {
      if (el) controls.current.set(id, el);
      else controls.current.delete(id);
    },
    /** `toNext: false` always lands on the heading. */
    expectRemoval: (id: string, { toNext = true }: { toNext?: boolean } = {}) => {
      const index = ids.indexOf(id);
      plan.current = { removed: id, next: toNext ? (ids[index + 1] ?? null) : null };
    },
    cancel: () => {
      plan.current = null;
    },
  };
}
