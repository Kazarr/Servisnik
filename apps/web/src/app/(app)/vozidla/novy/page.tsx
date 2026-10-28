import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getCustomer } from '../../../../dal/customers.ts';
import { first, pageOf } from '../../search-params.ts';
import { addVehicle } from '../actions.ts';
import { PickOwner } from '../pick-owner.tsx';
import { VehicleForm } from '../vehicle-form.tsx';

export const metadata: Metadata = { title: 'Nové vozidlo' };

/** `?zakaznik=<id>` names the Majiteľ the form is opened for, as the button on a customer's detail does; without it the owner is searched for. */
export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ zakaznik?: string | string[]; q?: string | string[]; strana?: string | string[] }>;
}) {
  const user = await currentUserWith('vehicles.write');
  const { zakaznik, q, strana } = await searchParams;
  if (zakaznik === undefined) {
    return (
      <PickOwner
        user={user}
        query={first(q)}
        page={pageOf(strana)}
        path="/vozidla/novy"
        title="Nové vozidlo"
        ownerHref={(id) => `/vozidla/novy?zakaznik=${id}`}
      />
    );
  }

  const owner = typeof zakaznik === 'string' ? await getCustomer(user, zakaznik) : null;
  if (!owner) notFound();
  return (
    <>
      <h1>Nové vozidlo</h1>
      <p>
        Majiteľ: <strong>{owner.name}</strong> · <Link href="/vozidla/novy">Zmeniť majiteľa</Link>
      </p>
      <VehicleForm action={addVehicle} ownerId={owner.id} />
    </>
  );
}
