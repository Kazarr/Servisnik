import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getVehicle } from '../../../../../dal/vehicles.ts';
import { editVehicle } from '../../actions.ts';
import { VehicleForm } from '../../vehicle-form.tsx';

export const metadata: Metadata = { title: 'Upraviť vozidlo' };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const vehicle = await getVehicle(await currentUserWith('vehicles.write'), (await params).id);
  if (!vehicle) notFound();

  const { id, vin, licensePlate, make, model, year, fuel, mileageKm, note, owner } = vehicle;
  return (
    <>
      <h1>Upraviť vozidlo</h1>
      <p>
        Majiteľ: <strong>{owner.name}</strong>
      </p>
      <VehicleForm action={editVehicle} vehicle={{ id, vin, licensePlate, make, model, year, fuel, mileageKm, note }} />
    </>
  );
}
