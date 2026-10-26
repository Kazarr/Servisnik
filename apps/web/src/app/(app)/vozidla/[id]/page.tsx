import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '../../../../dal/current-user.ts';
import { getVehicle } from '../../../../dal/vehicles.ts';

export const metadata: Metadata = { title: 'Vozidlo' };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const vehicle = await getVehicle(await currentUser(), (await params).id);
  if (!vehicle) notFound();

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
    </>
  );
}
