import { useState } from 'react';

/**
 * The current page of a filtered list. It returns 1 whenever `filterKey` changes (a new
 * search, filter or sort), without an extra render or effect: the stored page only counts
 * while it belongs to the current key.
 */
export function useResettingPage(filterKey: string): [number, (page: number) => void] {
  const [state, setState] = useState({ key: filterKey, page: 1 });
  const page = state.key === filterKey ? state.page : 1;
  return [page, (next: number) => setState({ key: filterKey, page: next })];
}
