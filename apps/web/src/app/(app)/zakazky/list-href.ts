import { defaultStatusFilter, type ListFilter } from '@servisnik/domain/work-order';

/**
 * The address of page `page` of the list of Zákazky under this filter: `?stav=` is the status, `?od=` and
 * `?do=` the days of intake, `?strana=` the page. What is the default (Neuzavreté, no day, page 1) is left out.
 */
export function listHref(filter: ListFilter, page: number) {
  const params = new URLSearchParams();
  if (filter.status !== defaultStatusFilter) params.set('stav', filter.status);
  if (filter.from) params.set('od', filter.from);
  if (filter.to) params.set('do', filter.to);
  if (page > 1) params.set('strana', String(page));
  return params.size ? `/zakazky?${params}` : '/zakazky';
}
