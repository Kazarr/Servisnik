import { can, type Role } from '@servisnik/domain/access';
import Link from 'next/link';
import type { listWorkOrders } from '../../../dal/work-orders.ts';
import { workOrderStatusLabels } from './status-labels.ts';

/**
 * The Zákazky as a table. Whoever may not read a Zákazka sees its number as plain text, and whoever
 * may not add one is not told to add it on the detail of a vehicle either. `without: 'vehicle'`
 * leaves out the Vozidlo column, for the detail of a vehicle, where it is the same in every row.
 */
export function WorkOrderList({
  orders,
  role,
  without,
}: {
  orders: Awaited<ReturnType<typeof listWorkOrders>>;
  role: Role;
  without?: 'vehicle';
}) {
  if (orders.length === 0) {
    return <p>{can(role, 'work-orders.write') ? 'Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.' : 'Zatiaľ tu nič nie je.'}</p>;
  }
  const canRead = can(role, 'work-orders.read');
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
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{canRead ? <Link href={`/zakazky/${order.id}`}>{order.number}</Link> : order.number}</td>
              <td>{order.customer.name}</td>
              {withVehicle && (
                <td>
                  {order.vehicle.make} {order.vehicle.model}, {order.vehicle.vin}
                </td>
              )}
              <td>{workOrderStatusLabels[order.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
