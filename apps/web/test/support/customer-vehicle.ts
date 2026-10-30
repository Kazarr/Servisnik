import { createCustomer } from '../../src/dal/customers.ts';
import { createVehicle } from '../../src/dal/vehicles.ts';
import { createWorkOrder } from '../../src/dal/work-orders.ts';
import type { Database } from '../../src/db/index.ts';
import { admin } from './dal-users.ts';
import { idOf } from './id-of.ts';

export const vin = 'WVWZZZ1JZ3W386752';

/**
 * Saves Zákazníci, Vozidlá and Zákazky as the admin and answers with their ids. The database comes from `getDb`, because a test
 * file only has one once its `beforeAll` ran.
 */
export const savedIn = (getDb: () => Database) => {
  const customer = async (fields: Parameters<typeof createCustomer>[1]) => idOf(await createCustomer(admin, fields, getDb()));
  return {
    person: (name = 'Ján Novák') => customer({ type: 'person', name }),
    company: (name: string, ico: string, more: Partial<Parameters<typeof createCustomer>[1]> = {}) => customer({ type: 'company', name, ico, ...more }),
    /** The default Vozidlo is a Volkswagen Golf with a ŠPZ; `more` changes what it has. */
    vehicleOf: async (ownerId: string, more: Partial<Omit<Parameters<typeof createVehicle>[1], 'ownerId'>> = {}) =>
      idOf(await createVehicle(admin, { ownerId, vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf', ...more }, getDb())),
    /** A Zákazka on the Vozidlo, for the Majiteľ unless another customer is named. */
    orderOn: async (vehicleId: string, customerId?: string) => {
      const created = await createWorkOrder(admin, { vehicleId, customerId, mileageKm: '1000', customerRequest: 'Výmena oleja' }, getDb());
      if (!created.ok) throw new Error('The record was expected to be saved.');
      return { id: created.id, number: created.number };
    },
  };
};
