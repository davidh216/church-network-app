import { useEffect, useState } from 'react';

/** Search inputs wait this long after the last keystroke before querying. */
export const SEARCH_DEBOUNCE_MS = 300;

/** `value`, updated only after it has stayed unchanged for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
