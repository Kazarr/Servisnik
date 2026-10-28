import { parseVehicle, type VehicleErrors, type VehicleInput, type VinError } from '@servisnik/domain/vehicle';
import { localYear } from '@servisnik/domain/work-order';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** What the domain finds wrong, or a VIN that another Vozidlo already has. */
export type VehicleSaveErrors = Omit<VehicleErrors, 'vin'> & { vin?: VinError | 'taken' };
/** The Vozidlo that has the VIN, with its Majiteľ, so the form can show whose it is and link to it. */
type Existing = { id: string; make: string; model: string; owner: { id: string; name: string } };

export type CreateVehicleResult = { ok: true; id: string } | { ok: false; errors: VehicleSaveErrors; existing?: Existing };
export type UpdateVehicleResult = { ok: true } | { ok: false; errors: VehicleSaveErrors & { vehicle?: 'unknown' }; existing?: Existing };

/** PostgreSQL refused a second Vozidlo with a VIN (the unique index decides, so two saves at once cannot both get through). */
function isVinTaken(error: unknown) {
  // Drizzle wraps the driver's error as `cause`.
  return error instanceof Error && (error.cause as { constraint?: string } | undefined)?.constraint === 'vehicle_vin_idx';
}

/** The failure for a VIN that is taken, with the Vozidlo that has it. */
async function vinTaken(vin: string, db: Database) {
  const [existing] = await db
    .select({ id: vehicle.id, make: vehicle.make, model: vehicle.model, owner: { id: customer.id, name: customer.name } })
    .from(vehicle)
    .innerJoin(customer, eq(vehicle.ownerId, customer.id))
    .where(eq(vehicle.vin, vin));
  return { ok: false, errors: { vin: 'taken' }, existing } as const;
}

/**
 * Saves a Vozidlo for `ownerId`, the Zákazník it is added from. The domain normalises the VIN and ŠPZ,
 * and the unique index on the VIN decides a duplicate: two attempts at once cannot both get through.
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
  const [saved] = await db
    .insert(vehicle)
    .values({ ...parsed.vehicle, ownerId })
    .onConflictDoNothing({ target: vehicle.vin })
    .returning({ id: vehicle.id });
  return saved ? { ok: true, id: saved.id } : vinTaken(parsed.vehicle.vin, db);
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
    if (!isVinTaken(error)) throw error;
    return vinTaken(parsed.vehicle.vin, db);
  }
}

const withOwner = {
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
};

/** Every Vozidlo with its Majiteľ, newest first. */
export async function listVehicles(user: User | null, db: Database = getDb()) {
  assertCan(user, 'vehicles.read');
  return db.select(withOwner).from(vehicle).innerJoin(customer, eq(vehicle.ownerId, customer.id)).orderBy(desc(vehicle.createdAt));
}

/** One Vozidlo with its Majiteľ, or null when there is none with this id. */
export async function getVehicle(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'vehicles.read');
  if (!isUuid(id)) return null;
  const [found] = await db.select(withOwner).from(vehicle).innerJoin(customer, eq(vehicle.ownerId, customer.id)).where(eq(vehicle.id, id));
  return found ?? null;
}
