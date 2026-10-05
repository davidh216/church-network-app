/** Paged list responses (Phase 2 spec 1.2): the page of items plus the total across pages. */
export interface Paged {
  total: number;
  page: number;
  pageSize: number;
}

type QueryValue = string | number | boolean | null | undefined;

/**
 * `?a=1&b=x` from a params object, or '' when nothing is set. Undefined, null and blank
 * values are left out, so an unset filter never reaches the API.
 */
export function queryString(params: object = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, QueryValue][]) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) search.set(key, text);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
