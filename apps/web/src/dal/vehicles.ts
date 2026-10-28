import { parseVehicle, parseVehicleSearch, type VehicleErrors, type VehicleInput, type VinError } from '@servisnik/domain/vehicle';
import { localYear } from '@servisnik/domain/work-order';
import { count, desc, eq, or } from 'drizzle-orm';
import { getDb, type Database, type Executor } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { violates } from './constraint.ts';
import { contains, pageWindow } from './paging.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** What the domain finds wrong, or a VIN that another Vozidlo already has. */
export type VehicleSaveErrors = Omit<VehicleErrors, 'vin'> & { vin?: VinError | 'taken' };
/** The Vozidlo that has the VIN, with its Majiteľ, so the form can show whose it is and link to it. */
export type ExistingVehicle = { id: string; make: string; model: string; owner: { id: string; name: string } };

export type CreateVehicleResult =
  | { ok: true; id: string }
  | { ok: false; errors: VehicleSaveErrors & { owner?: 'unknown' }; existing?: ExistingVehicle };
export type UpdateVehicleResult = { ok: true } | { ok: false; errors: VehicleSaveErrors & { vehicle?: 'unknown' }; existing?: ExistingVehicle };

/** The Vozidlá with their Majiteľ; the caller adds the filter and the order. */
const vehiclesWithOwner = (db: Executor) =>
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
async function vinTaken(vin: string, db: Executor) {
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
 * fields parse. As a step of a bigger transaction (`db`), an `ownerId` that is no Zákazník leaves that
 * transaction aborted, because PostgreSQL aborts one on a foreign key violation: the caller rolls it back.
 */
export async function createVehicle(
  user: User | null,
  input: VehicleInput & { ownerId: string },
  db: Executor = getDb(),
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

/**
 * A page of Vozidlá with their Majiteľ that match `query`, the newest first. The query is a part of
 * the VIN, of the ŠPZ or of the name of the Majiteľ; the domain normalizes it the way the stored
 * values are (packages/domain/src/vehicle), the name against the search key of the Zákazník. A blank
 * query has nothing to look for, so every Vozidlo matches. `page` counts from 1, as in `searchCustomers`.
 * Admin only.
 */
// ponytail: a scan of both tables per search; rewrite `contains` to an escaped LIKE and add a pg_trgm GIN index on the VIN, the ŠPZ and `search_name` if the tables outgrow ~100k rows.
export async function searchVehicles(user: User | null, { query = '', page = 1 }: { query?: string; page?: number } = {}, db: Database = getDb()) {
  assertCan(user, 'vehicles.read');
  const { code, ownerName } = parseVehicleSearch(query);
  const matching = or(
    code ? contains(vehicle.vin, code) : undefined,
    code ? contains(vehicle.licensePlate, code) : undefined,
    ownerName ? contains(customer.searchName, ownerName) : undefined,
  );

  const [counted] = await db.select({ total: count() }).from(vehicle).innerJoin(customer, eq(vehicle.ownerId, customer.id)).where(matching);
  const total = counted!.total;
  const { page: current, pageCount, limit, offset } = pageWindow(total, page);
  // The id settles the order of Vozidlá saved at the same moment, so no Vozidlo is on two pages or on none.
  const vehicles = await vehiclesWithOwner(db).where(matching).orderBy(desc(vehicle.createdAt), vehicle.id).limit(limit).offset(offset);
  return { vehicles, page: current, pageCount, total };
}

/** One Vozidlo with its Majiteľ, or null when there is none with this id. */
export async function getVehicle(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'vehicles.read');
  if (!isUuid(id)) return null;
  const [found] = await vehiclesWithOwner(db).where(eq(vehicle.id, id));
  return found ?? null;
}
