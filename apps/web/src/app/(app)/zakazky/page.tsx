import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUser } from '../../../dal/current-user.ts';
import { listWorkOrders } from '../../../dal/work-orders.ts';
import { workOrderStatusLabels } from './status-labels.ts';

export const metadata: Metadata = { title: 'Zákazky' };

export default async function WorkOrdersPage() {
  const orders = await listWorkOrders(await currentUser());
  return (
    <>
      <h1>Zákazky</h1>
      {orders.length === 0 ? (
        <p>Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Číslo</th>
                <th scope="col">Zákazník</th>
                <th scope="col">Vozidlo</th>
                <th scope="col">Stav</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/zakazky/${order.id}`}>{order.number}</Link>
                  </td>
                  <td>{order.customer.name}</td>
                  <td>
                    {order.vehicle.make} {order.vehicle.model}, {order.vehicle.vin}
                  </td>
                  <td>{workOrderStatusLabels[order.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
