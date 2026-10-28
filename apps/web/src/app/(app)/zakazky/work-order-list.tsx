import { can, type Role } from '@servisnik/domain/access';
import { rowMark, type RowMark } from '@servisnik/domain/work-order';
import Link from 'next/link';
import type { listWorkOrders } from '../../../dal/work-orders.ts';
import { formatDate } from '../../../format.ts';
import { workOrderStatusLabels } from './status-labels.ts';

/** The label of a marked row, and the classes of the row and of the label. The label is text: the colour is never the only signal. */
const marks: Record<RowMark, { label: string; row: string; badge: string }> = {
  late: { label: 'Po termíne', row: 'row-late', badge: 'mark mark-late' },
  toInvoice: { label: 'Na fakturáciu', row: 'row-to-invoice', badge: 'mark mark-to-invoice' },
};

/**
 * The Zákazky as a table. Whoever may not open a Zákazka (the mechanik may, without its prices) sees its number as plain text, and whoever
 * may not add one is not told to add it on the detail of a vehicle either. `without: 'vehicle'`
 * leaves out the Vozidlo column, for the detail of a vehicle, where it is the same in every row. A row
 * is marked by the domain's `rowMark` from its status, its Termín and today (`now`) in Europe/Bratislava,
 * the same for every Rola. `filter` is the filter of the list in Zákazky: an empty list that a filter
 * produced, the default one too, says that no Zákazka matches it, since Zákazky may exist that it hides;
 * only a list that nothing filters is an empty system.
 */
export function WorkOrderList({
  orders,
  role,
  now,
  without,
  filter,
}: {
  orders: Awaited<ReturnType<typeof listWorkOrders>>['orders'];
  role: Role;
  now: Date;
  without?: 'vehicle';
  filter?: Awaited<ReturnType<typeof listWorkOrders>>['filter'];
}) {
  if (orders.length === 0) {
    if (filter && (filter.status !== 'all' || filter.from || filter.to)) return <p>Žiadna zákazka nezodpovedá filtru.</p>;
    return <p>{can(role, 'work-orders.write') ? 'Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.' : 'Zatiaľ tu nič nie je.'}</p>;
  }
  const canOpen = can(role, 'work-orders.read-unpriced');
  const withVehicle = without !== 'vehicle';
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Číslo</th>
            <th scope="col">Zákazník</th>
            {withVehicle && <th scope="col">Vozidlo</th>}
            <th scope="col">Stav</th>
            <th scope="col">Termín</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const found = rowMark(order.status, order.deadline, now);
            const mark = found && marks[found];
            return (
              <tr key={order.id} className={mark?.row}>
                <td>{canOpen ? <Link href={`/zakazky/${order.id}`}>{order.number}</Link> : order.number}</td>
                <td>{order.customer.name}</td>
                {withVehicle && (
                  <td>
                    {order.vehicle.make} {order.vehicle.model}, {order.vehicle.vin}
                  </td>
                )}
                <td>
                  {workOrderStatusLabels[order.status]}
                  {mark && (
                    <>
                      {' '}
                      <span className={mark.badge}>{mark.label}</span>
                    </>
                  )}
                </td>
                <td>{order.deadline ? formatDate(order.deadline) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
