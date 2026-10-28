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
 * The Zákazky as a table. Whoever may not read a Zákazka sees its number as plain text, and whoever
 * may not add one is not told to add it on the detail of a vehicle either. `without: 'vehicle'`
 * leaves out the Vozidlo column, for the detail of a vehicle, where it is the same in every row. A row
 * is marked by the domain's `rowMark` from its status, its Termín and today (`now`) in Europe/Bratislava;
 * whoever may not write is not shown "Na fakturáciu", which speaks of the invoice.
 */
export function WorkOrderList({
  orders,
  role,
  now,
  without,
}: {
  orders: Awaited<ReturnType<typeof listWorkOrders>>['orders'];
  role: Role;
  now: Date;
  without?: 'vehicle';
}) {
  if (orders.length === 0) {
    return <p>{can(role, 'work-orders.write') ? 'Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.' : 'Zatiaľ tu nič nie je.'}</p>;
  }
  const canRead = can(role, 'work-orders.read');
  const canWrite = can(role, 'work-orders.write');
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
            const mark = found === 'toInvoice' && !canWrite ? null : found && marks[found];
            return (
              <tr key={order.id} className={mark?.row}>
                <td>{canRead ? <Link href={`/zakazky/${order.id}`}>{order.number}</Link> : order.number}</td>
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
