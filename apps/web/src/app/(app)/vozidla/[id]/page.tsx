import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getVehicle } from '../../../../dal/vehicles.ts';
import { listUnclosedWorkOrdersOfVehicle } from '../../../../dal/work-orders.ts';
import { workOrderStatusLabels } from '../../zakazky/status-labels.ts';

export const metadata: Metadata = { title: 'Vozidlo' };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('vehicles.read');
  const vehicle = await getVehicle(user, (await params).id);
  if (!vehicle) notFound();
  const unclosedOrders = await listUnclosedWorkOrdersOfVehicle(user, vehicle.id);

  return (
    <>
      <h1>
        {vehicle.make} {vehicle.model}
      </h1>
      <dl className="details">
        <div>
          <dt>VIN</dt>
          <dd>{vehicle.vin}</dd>
        </div>
        {vehicle.licensePlate && (
          <div>
            <dt>ŠPZ</dt>
            <dd>{vehicle.licensePlate}</dd>
          </div>
        )}
        <div>
          <dt>Majiteľ</dt>
          <dd>
            <Link href={`/zakaznici/${vehicle.owner.id}`}>{vehicle.owner.name}</Link>
          </dd>
        </div>
      </dl>

      <div className="page-header">
        <h2>Zákazky</h2>
        <Link href={`/zakazky/nova?vozidlo=${vehicle.id}`} className="button">
          Nová zákazka
        </Link>
      </div>
      {unclosedOrders.length > 0 && (
        <>
          <h3>Otvorené zákazky</h3>
          <ul>
            {unclosedOrders.map((order) => (
              <li key={order.id}>
                <Link href={`/zakazky/${order.id}`}>{order.number}</Link> ({workOrderStatusLabels[order.status]})
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
