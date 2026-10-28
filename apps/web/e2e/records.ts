import { createCustomer } from '../src/dal/customers.ts';
import type { User } from '../src/dal/user.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { createWorkOrder } from '../src/dal/work-orders.ts';
import { createDb, type Database } from '../src/db/index.ts';

const admin: User = { id: 'e2e-records', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };

/** A connection to the database of the run (see global-setup.ts); the spec closes it with `db.$client.end()`. */
export const openDatabase = () => createDb(process.env.E2E_DATABASE_URL!);

function idOf(result: { ok: true; id: string } | { ok: false }) {
  if (!result.ok) throw new Error('The record was expected to be saved.');
  return result.id;
}

/**
 * A Zákazník with a Vozidlo and a Zákazka (Prijatá), made through the DAL as the admin and named by
 * `tag`, so that a spec finds its own rows in the database all specs share.
 */
export async function seedWorkOrder(db: Database, tag: string) {
  const customerName = `Zákazník ${tag}`;
  const customerId = idOf(await createCustomer(admin, { type: 'person', name: customerName }, db));
  // E, 2, E and a tag of hex digits: 17 characters that are a VIN for the app.
  const vin = `E2E${tag.toUpperCase().padEnd(6, '0')}00000000`;
  const vehicleId = idOf(await createVehicle(admin, { ownerId: customerId, vin, licensePlate: '', make: 'Škoda', model: 'Octavia' }, db));
  const created = await createWorkOrder(admin, { vehicleId, mileageKm: '1000', customerRequest: `Výmena oleja ${tag}` }, db);
  if (!created.ok) throw new Error('The record was expected to be saved.');
  return { customerId, customerName, vehicleId, vin, orderId: created.id, number: created.number };
}
