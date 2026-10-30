import { createCustomer } from '../../src/dal/customers.ts';
import { createVehicle } from '../../src/dal/vehicles.ts';
import type { Database } from '../../src/db/index.ts';
import { admin } from './dal-users.ts';
import { idOf } from './id-of.ts';

export const vin = 'WVWZZZ1JZ3W386752';

/**
 * Saves a Zákazník and a Vozidlo as the admin and answers with their ids. The database comes from `getDb`, because a test
 * file only has one once its `beforeAll` ran.
 */
export const savedIn = (getDb: () => Database) => ({
  person: async (name = 'Ján Novák') => idOf(await createCustomer(admin, { type: 'person', name }, getDb())),
  vehicleOf: async (ownerId: string) => idOf(await createVehicle(admin, { ownerId, vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, getDb())),
});
