import { parseVehicle, type VehicleErrors, type VehicleInput, type VinError } from '@servisnik/domain/vehicle';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { violates } from './constraint.ts';
import { assertAdmin, assertUser, type User } from './user.ts';
import { isUuid } from './uuid.ts';

export type CreateVehicleResult =
  | { ok: true; id: string }
  | { ok: false; errors: Omit<VehicleErrors, 'vin'> & { vin?: VinError | 'taken'; owner?: 'unknown' } };

/**
 * Saves a Vozidlo for `ownerId`, the Zákazník it is added from; only the admin may (GLOSSARY, Rola).
 * The domain normalises the VIN, and the unique index on it decides a duplicate: two attempts at once
 * cannot both get through. An `ownerId` that is no Zákazník, or not even an id, comes back as
 * `owner: 'unknown'`; the foreign key decides that too, so no check can go stale before the insert.
 */
export async function createVehicle(
  user: User | null,
  input: VehicleInput & { ownerId: string },
  db: Database = getDb(),
): Promise<CreateVehicleResult> {
  assertAdmin(user);
  const { ownerId, ...fields } = input;
  const parsed = parseVehicle(fields);
  if (!parsed.ok) return parsed;
  if (!isUuid(ownerId)) return { ok: false, errors: { owner: 'unknown' } };
  try {
    const [saved] = await db
      .insert(vehicle)
      .values({ ...parsed.vehicle, ownerId })
      .onConflictDoNothing({ target: vehicle.vin })
      .returning({ id: vehicle.id });
    return saved ? { ok: true, id: saved.id } : { ok: false, errors: { vin: 'taken' } };
  } catch (error) {
    if (!violates(error, 'vehicle_owner_id_customer_id_fk')) throw error;
    return { ok: false, errors: { owner: 'unknown' } };
  }
}

const withOwner = {
  id: vehicle.id,
  vin: vehicle.vin,
  licensePlate: vehicle.licensePlate,
  make: vehicle.make,
  model: vehicle.model,
  owner: { id: customer.id, name: customer.name },
};

/** Every Vozidlo with its Majiteľ, newest first. */
export async function listVehicles(user: User | null, db: Database = getDb()) {
  assertUser(user);
  return db.select(withOwner).from(vehicle).innerJoin(customer, eq(vehicle.ownerId, customer.id)).orderBy(desc(vehicle.createdAt));
}

/** One Vozidlo with its Majiteľ, or null when there is none with this id. */
export async function getVehicle(user: User | null, id: string, db: Database = getDb()) {
  assertUser(user);
  if (!isUuid(id)) return null;
  const [found] = await db.select(withOwner).from(vehicle).innerJoin(customer, eq(vehicle.ownerId, customer.id)).where(eq(vehicle.id, id));
  return found ?? null;
}
