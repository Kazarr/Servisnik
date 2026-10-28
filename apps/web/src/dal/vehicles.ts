import { parseVehicle, type VehicleErrors, type VehicleInput, type VinError } from '@servisnik/domain/vehicle';
import { localYear } from '@servisnik/domain/work-order';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { violates } from './constraint.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** What the domain finds wrong, or a VIN that another Vozidlo already has. */
export type VehicleSaveErrors = Omit<VehicleErrors, 'vin'> & { vin?: VinError | 'taken' };
/** The Vozidlo that has the VIN, with its Majiteľ, so the form can show whose it is and link to it. */
type Existing = { id: string; make: string; model: string; owner: { id: string; name: string } };

export type CreateVehicleResult =
  | { ok: true; id: string }
  | { ok: false; errors: VehicleSaveErrors & { owner?: 'unknown' }; existing?: Existing };
export type UpdateVehicleResult = { ok: true } | { ok: false; errors: VehicleSaveErrors & { vehicle?: 'unknown' }; existing?: Existing };

/** The Vozidlá with their Majiteľ; the caller adds the filter and the order. */
const vehiclesWithOwner = (db: Database) =>
  db
    .select({
      id: vehicle.id,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuel: vehicle.fuel,
      mileageKm: vehicle.mileageKm,
      note: vehicle.note,
      owner: { id: customer.id, name: customer.name },
    })
    .from(vehicle)
    .innerJoin(customer, eq(vehicle.ownerId, customer.id));

/** The failure for a VIN that is taken, with the Vozidlo that has it. */
async function vinTaken(vin: string, db: Database) {
  const [found] = await vehiclesWithOwner(db).where(eq(vehicle.vin, vin));
  const existing = found && { id: found.id, make: found.make, model: found.model, owner: found.owner };
  return { ok: false, errors: { vin: 'taken' }, existing } as const;
}

/**
 * Saves a Vozidlo for `ownerId`, the Zákazník it is added from; only the admin may (GLOSSARY, Rola).
 * The domain normalises the VIN and ŠPZ, and the unique index on the VIN decides a duplicate: two
 * attempts at once cannot both get through. Once the fields parse and the VIN is free, an `ownerId`
 * that is no Zákazník comes back as `owner: 'unknown'`; the foreign key decides that too, so no check
 * can go stale before the insert. An `ownerId` that is not even an id comes back so as soon as the
 * fields parse.
 */
export async function createVehicle(
  user: User | null,
  input: VehicleInput & { ownerId: string },
  db: Database = getDb(),
): Promise<CreateVehicleResult> {
  assertCan(user, 'vehicles.write');
  const { ownerId, ...fields } = input;
  const parsed = parseVehicle(fields, localYear(new Date()));
  if (!parsed.ok) return parsed;
  if (!isUuid(ownerId)) return { ok: false, errors: { owner: 'unknown' } };
  try {
    const [saved] = await db
      .insert(vehicle)
      .values({ ...parsed.vehicle, ownerId })
      .onConflictDoNothing({ target: vehicle.vin })
      .returning({ id: vehicle.id });
    return saved ? { ok: true, id: saved.id } : await vinTaken(parsed.vehicle.vin, db);
  } catch (error) {
    if (!violates(error, 'vehicle_owner_id_customer_id_fk')) throw error;
    return { ok: false, errors: { owner: 'unknown' } };
  }
}

/**
 * Replaces every field of a Vozidlo with `input`: a blank one clears what was there. The VIN may be
 * corrected, and the rules for it stay. The Majiteľ is not here, only a Prepis changes it, and the
 * Zákazky stay with the Vozidlo because they hold its id, not its VIN.
 */
export async function updateVehicle(user: User | null, id: string, input: VehicleInput, db: Database = getDb()): Promise<UpdateVehicleResult> {
  assertCan(user, 'vehicles.write');
  const parsed = parseVehicle(input, localYear(new Date()));
  if (!parsed.ok) return parsed;
  if (!isUuid(id)) return { ok: false, errors: { vehicle: 'unknown' } };
  try {
    const [saved] = await db.update(vehicle).set(parsed.vehicle).where(eq(vehicle.id, id)).returning({ id: vehicle.id });
    return saved ? { ok: true } : { ok: false, errors: { vehicle: 'unknown' } };
  } catch (error) {
    if (!violates(error, 'vehicle_vin_idx')) throw error;
    return vinTaken(parsed.vehicle.vin, db);
  }
}

/** Every Vozidlo with its Majiteľ, newest first. */
export async function listVehicles(user: User | null, db: Database = getDb()) {
  assertCan(user, 'vehicles.read');
  return vehiclesWithOwner(db).orderBy(desc(vehicle.createdAt));
}

/** One Vozidlo with its Majiteľ, or null when there is none with this id. */
export async function getVehicle(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'vehicles.read');
  if (!isUuid(id)) return null;
  const [found] = await vehiclesWithOwner(db).where(eq(vehicle.id, id));
  return found ?? null;
}
