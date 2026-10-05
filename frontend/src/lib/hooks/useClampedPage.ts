import { useEffect } from 'react';

/** The last page of a paged list (1 when it is empty). */
export function lastPageFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Moves to the last page when the list shrinks below the current page (rows deleted or
 * filtered out elsewhere). `total` is undefined until a real (not placeholder) page arrives.
 */
export function useClampedPage(
  page: number,
  setPage: (page: number) => void,
  total: number | undefined,
  pageSize: number,
): void {
  const lastPage = total === undefined ? null : lastPageFor(total, pageSize);
  useEffect(() => {
    if (lastPage !== null && page > lastPage) setPage(lastPage);
  }, [page, lastPage, setPage]);
}
