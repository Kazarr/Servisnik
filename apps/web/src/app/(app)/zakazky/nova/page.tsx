import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { listCustomers } from '../../../../dal/customers.ts';
import { getVehicle } from '../../../../dal/vehicles.ts';
import { first, pageOf } from '../../search-params.ts';
import { FindVehicle } from './find-vehicle.tsx';
import { WorkOrderForm } from './work-order-form.tsx';

export const metadata: Metadata = { title: 'Nová zákazka' };

/**
 * A Zákazka is added for a Vozidlo: `?vozidlo=<id>` names it, as the button on the detail of a vehicle
 * does. Without it the Vozidlo is searched for, or a new one is begun (find-vehicle.tsx).
 */
export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ vozidlo?: string | string[]; q?: string | string[]; strana?: string | string[] }>;
}) {
  const user = await currentUserWith('work-orders.write');
  const { vozidlo, q, strana } = await searchParams;
  if (vozidlo === undefined) return <FindVehicle user={user} query={first(q)} page={pageOf(strana)} />;

  const vehicle = typeof vozidlo === 'string' ? await getVehicle(user, vozidlo) : null;
  if (!vehicle) notFound();
  const customers = await listCustomers(user);

  return (
    <>
      <h1>Nová zákazka</h1>
      <p>
        Vozidlo:{' '}
        <strong>
          {vehicle.make} {vehicle.model}
        </strong>{' '}
        ({vehicle.vin})
      </p>
      <WorkOrderForm vehicleId={vehicle.id} ownerId={vehicle.owner.id} customers={customers.map(({ id, name }) => ({ id, name }))} />
    </>
  );
}
