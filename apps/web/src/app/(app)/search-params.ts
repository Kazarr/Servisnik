// The address of a list with a search field: `?q=` is what is searched for and `?strana=` the page, from 1.

/** The first value of a search parameter, or nothing when it is missing. */
export const first = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

/** The page number a `?strana=` value asks for; searchCustomers takes anything that is not a page number as the first page. */
export const pageOf = (value: string | string[] | undefined) => Number(first(value) || 1);

/** The address of page `n` of the search for `query` on `path`. */
export function searchHref(path: string, query: string, n: number) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (n > 1) params.set('strana', String(n));
  return params.size ? `${path}?${params}` : path;
}
