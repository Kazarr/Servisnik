import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getCustomer } from '../../../../../dal/customers.ts';
import { getVehicle } from '../../../../../dal/vehicles.ts';
import { first, pageOf } from '../../../search-params.ts';
import { OwnerSearch } from '../../owner-search.tsx';
import { TransferForm } from './transfer-form.tsx';

export const metadata: Metadata = { title: 'Prepísať vozidlo' };

/**
 * The Prepis of a Vozidlo, in two steps. Without `?zakaznik=` the new Majiteľ is searched for, and the
 * current one is not offered. With `?zakaznik=<id>` the admin confirms the Prepis from the Majiteľ shown here.
 */
export default async function TransferVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zakaznik?: string | string[]; q?: string | string[]; strana?: string | string[] }>;
}) {
  const user = await currentUserWith('vehicles.write');
  const vehicle = await getVehicle(user, (await params).id);
  if (!vehicle) notFound();
  const { zakaznik, q, strana } = await searchParams;
  const { id, make, model, vin, owner } = vehicle;
  const path = `/vozidla/${id}/prepis`;

  if (zakaznik === undefined) {
    return (
      <>
        <h1>Prepísať vozidlo</h1>
        <p>
          {make} {model}, {vin}. Súčasný majiteľ: <strong>{owner.name}</strong>. Vyberte nového majiteľa.
        </p>
        <OwnerSearch user={user} query={first(q)} page={pageOf(strana)} path={path} except={owner.id} />
      </>
    );
  }

  const buyer = typeof zakaznik === 'string' && zakaznik !== owner.id ? await getCustomer(user, zakaznik) : null;
  if (!buyer) notFound();
  return (
    <>
      <h1>Prepísať vozidlo</h1>
      <p>
        Vozidlo <strong>{make} {model}</strong>, {vin}, sa prepíše z <strong>{owner.name}</strong> na <strong>{buyer.name}</strong>. Zákazky ostanú pri vozidle, každá so svojím
        zákazníkom.
      </p>
      <TransferForm vehicleId={id} fromOwnerId={owner.id} toOwnerId={buyer.id} />
      <p>
        <Link href={path}>Vybrať iného majiteľa</Link> · <Link href={`/vozidla/${id}`}>Zrušiť</Link>
      </p>
    </>
  );
}
