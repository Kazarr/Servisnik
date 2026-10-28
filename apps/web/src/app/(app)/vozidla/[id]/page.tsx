import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getVehicle } from '../../../../dal/vehicles.ts';
import { listOpenWorkOrdersOfVehicle } from '../../../../dal/work-orders.ts';
import { formatWhole } from '../../../../format.ts';
import { workOrderStatusLabels } from '../../zakazky/status-labels.ts';
import { fuelLabels } from '../fuel-labels.ts';

export const metadata: Metadata = { title: 'Vozidlo' };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('vehicles.read');
  const vehicle = await getVehicle(user, (await params).id);
  if (!vehicle) notFound();
  const openOrders = await listOpenWorkOrdersOfVehicle(user, vehicle.id);

  const details: [label: string, value: ReactNode][] = [
    ['VIN', vehicle.vin],
    ['ŠPZ', vehicle.licensePlate],
    ['Rok výroby', vehicle.year],
    ['Palivo', vehicle.fuel && fuelLabels[vehicle.fuel]],
    ['Najazdené km', vehicle.mileageKm !== null && `${formatWhole(vehicle.mileageKm)} km`],
    ['Poznámka', vehicle.note],
    ['Majiteľ', <Link href={`/zakaznici/${vehicle.owner.id}`}>{vehicle.owner.name}</Link>],
  ];

  return (
    <>
      <div className="page-header">
        <h1>
          {vehicle.make} {vehicle.model}
        </h1>
        <Link href={`/vozidla/${vehicle.id}/upravit`} className="button">
          Upraviť
        </Link>
      </div>
      <dl className="details">
        {details
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      <div className="page-header">
        <h2>Zákazky</h2>
        <Link href={`/zakazky/nova?vozidlo=${vehicle.id}`} className="button">
          Nová zákazka
        </Link>
      </div>
      {openOrders.length > 0 && (
        <>
          <h3>Otvorené zákazky</h3>
          <ul>
            {openOrders.map((order) => (
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
