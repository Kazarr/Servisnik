import type { Metadata } from 'next';
import { currentUserWith } from '../../../dal/current-user.ts';
import { listWorkOrders } from '../../../dal/work-orders.ts';
import { Pager } from '../pager.tsx';
import { first, pageOf } from '../search-params.ts';
import { listHref } from './list-href.ts';
import { WorkOrderFilter } from './work-order-filter.tsx';
import { WorkOrderList } from './work-order-list.tsx';

export const metadata: Metadata = { title: 'Zákazky' };

type Params = Partial<Record<'stav' | 'od' | 'do' | 'strana', string | string[]>>;

/** The list: `?stav=`, `?od=`, `?do=` and `?strana=` are the filter and the page (list-href.ts); what is not valid is left out. */
export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await currentUserWith('work-orders.list');
  const params = await searchParams;
  const { orders, page, pageCount, filter } = await listWorkOrders(user, {
    status: first(params.stav),
    from: first(params.od),
    to: first(params.do),
    page: pageOf(params.strana),
  });
  return (
    <>
      <h1>Zákazky</h1>
      <WorkOrderFilter filter={filter} />
      <WorkOrderList orders={orders} role={user.role} now={new Date()} filter={filter} />
      <Pager page={page} pageCount={pageCount} href={(n) => listHref(filter, n)} />
    </>
  );
}
