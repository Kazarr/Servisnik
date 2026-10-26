import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUser } from '../../../../dal/current-user.ts';
import { getCustomer } from '../../../../dal/customers.ts';
import { VehicleForm } from './vehicle-form.tsx';

export const metadata: Metadata = { title: 'Nové vozidlo' };

/** The vehicle is added from a customer's detail: `?zakaznik=<id>` names its Majiteľ. */
export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ zakaznik?: string | string[] }> }) {
  const user = await currentUser();
  const { zakaznik } = await searchParams;
  const owner = typeof zakaznik === 'string' ? await getCustomer(user, zakaznik) : null;
  if (!owner) notFound();

  return (
    <>
      <h1>Nové vozidlo</h1>
      <p>
        Majiteľ: <strong>{owner.name}</strong>
      </p>
      <VehicleForm ownerId={owner.id} />
    </>
  );
}
