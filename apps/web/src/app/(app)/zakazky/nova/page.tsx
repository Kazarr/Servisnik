import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { listCustomers } from '../../../../dal/customers.ts';
import { getVehicle } from '../../../../dal/vehicles.ts';
import { WorkOrderForm } from '../work-order-form.tsx';

export const metadata: Metadata = { title: 'Nová zákazka' };

/** A work order is added from a vehicle's detail: `?vozidlo=<id>` names the Vozidlo. */
export default async function NewWorkOrderPage({ searchParams }: { searchParams: Promise<{ vozidlo?: string | string[] }> }) {
  const user = await currentUserWith('work-orders.write');
  const { vozidlo } = await searchParams;
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
