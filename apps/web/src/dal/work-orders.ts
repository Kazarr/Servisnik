import { parseCustomer, type CustomerInput } from '@servisnik/domain/customer';
import { workOrderItemFromPriceListItem } from '@servisnik/domain/price-list';
import { parseVehicle, type VehicleInput } from '@servisnik/domain/vehicle';
import {
  canEdit,
  formatWorkOrderNumber,
  localYear,
  mileageAtIntake,
  parseListFilter,
  marginOf,
  parseItem,
  parseWorkOrder,
  statusesOf,
  transition,
  type ItemErrors,
  type ItemInput,
  type ItemKind,
  type WorkOrderErrors,
  type WorkOrderInput,
  type WorkOrderItem,
  type WorkOrderStatus,
  vatRatesKeeping,
} from '@servisnik/domain/work-order';
import { and, count, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { getDb, type Database, type Executor } from '../db/index.ts';
import { customer, priceListItem, vehicle, workOrder, workOrderCounter, workOrderItem } from '../db/schema.ts';
import { createCustomer, type CustomerSaveErrors, type ExistingCustomer } from './customers.ts';
import { pageWindow } from './paging.ts';
import { getRates } from './settings.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';
import { createVehicle, type ExistingVehicle, type VehicleSaveErrors } from './vehicles.ts';
import { inOrderAdded, withAmounts } from './work-order-items.ts';

/** The columns of an item that the detail of a Zákazka returns: all but `addedSeq`, its place, which only the order of a read uses. */
const { addedSeq: _place, ...itemColumns } = getTableColumns(workOrderItem);

/** The rows of `query`, or none when `id` is not a UUID: PostgreSQL would answer that with an error, not with no row. */
const rowsIfUuid = async <Row>(id: string, query: PromiseLike<Row[]>): Promise<Row[]> => (isUuid(id) ? await query : []);

export type CreateWorkOrderResult =
  /** `lowerMileage` is there when the kilometres are lower than the Stav km of the vehicle, which is then left as it is. */
  | { ok: true; id: string; number: string; lowerMileage?: { vehicleMileageKm: number } }
  | { ok: false; errors: WorkOrderErrors & { vehicle?: 'unknown'; customer?: 'unknown' } };

/**
 * Saves a Zákazka for a Vozidlo with the next number of the year in Europe/Bratislava. Its Zákazník is
 * `customerId`, or the Majiteľ of the vehicle now; the Zákazka keeps it from then on. The number is one
 * atomic upsert of the year's counter inside the same transaction as the Zákazka (see workOrderCounter).
 * The kilometres at intake become the Stav km of the vehicle when higher (`mileageAtIntake`), in the same
 * transaction; the vehicle row is locked from reading its Stav km to the commit, so two intakes at once
 * cannot lose the higher one.
 */
export async function createWorkOrder(
  user: User | null,
  input: WorkOrderInput & { vehicleId: string; customerId?: string },
  db: Executor = getDb(),
  now: Date = new Date(),
): Promise<CreateWorkOrderResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseWorkOrder(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    // "No key update" is enough to serialize intakes on the vehicle, and leaves the key share lock the new Zákazka takes on it alone.
    const [found] = await rowsIfUuid(
      input.vehicleId,
      tx.select({ ownerId: vehicle.ownerId, mileageKm: vehicle.mileageKm }).from(vehicle).where(eq(vehicle.id, input.vehicleId)).for('no key update'),
    );
    if (!found) return { ok: false, errors: { vehicle: 'unknown' } };
    const customerId = input.customerId || found.ownerId;
    const [known] = await rowsIfUuid(customerId, tx.select({ id: customer.id }).from(customer).where(eq(customer.id, customerId)));
    if (!known) return { ok: false, errors: { customer: 'unknown' } };

    // After every check that can refuse the Zákazka: a refusal returns, which commits, so a write before it would stay.
    const atIntake = mileageAtIntake(found.mileageKm, parsed.workOrder.mileageKm);
    if (atIntake.vehicleMileageKm !== found.mileageKm) {
      await tx.update(vehicle).set({ mileageKm: atIntake.vehicleMileageKm }).where(eq(vehicle.id, input.vehicleId));
    }

    const year = localYear(now);
    const [counter] = await tx
      .insert(workOrderCounter)
      .values({ year, lastSequence: 1 })
      .onConflictDoUpdate({ target: workOrderCounter.year, set: { lastSequence: sql`${workOrderCounter.lastSequence} + 1` } })
      .returning({ lastSequence: workOrderCounter.lastSequence });
    const number = formatWorkOrderNumber(year, counter!.lastSequence);
    const [saved] = await tx
      .insert(workOrder)
      .values({ number, customerId, vehicleId: input.vehicleId, ...parsed.workOrder })
      .returning({ id: workOrder.id });
    const lowerMileage = atIntake.lowerThanVehicle ? { lowerMileage: { vehicleMileageKm: atIntake.vehicleMileageKm } } : {};
    return { ok: true, id: saved!.id, number, ...lowerMileage };
  });
}

/** What the form of a Príjem vozidla with a new Vozidlo sends: its Majiteľ, who is an existing Zákazník or a new one, the Vozidlo, and the Zákazka. The Stav km of a new Vozidlo is the kilometres at intake. */
export type IntakeInput = WorkOrderInput & {
  owner: { id: string } | { customer: CustomerInput };
  vehicle: Omit<VehicleInput, 'mileageKm'>;
};

export type CreateIntakeResult =
  | { ok: true; id: string; number: string }
  | {
      ok: false;
      errors: { owner?: 'unknown'; customer?: CustomerSaveErrors; vehicle?: VehicleSaveErrors; workOrder?: WorkOrderErrors };
      /** The Firma that has the IČO, and the Vozidlo that has the VIN: the forms link to them. */
      existingCustomer?: ExistingCustomer;
      existingVehicle?: ExistingVehicle;
    };

/** Ends the transaction of an intake that was refused, with the refusal to hand back. */
class IntakeRefused extends Error {
  readonly refusal: Extract<CreateIntakeResult, { ok: false }>;

  constructor(refusal: Extract<CreateIntakeResult, { ok: false }>) {
    super('The intake was refused.');
    this.refusal = refusal;
  }
}

/**
 * Príjem vozidla with a new Vozidlo (GLOSSARY): saves the new Zákazník when there is one, the Vozidlo with
 * him or the existing Zákazník as its Majiteľ, and the Zákazka for it, whose Zákazník is the Majiteľ, all
 * in one transaction. A part that cannot be saved takes the others with it, whether the rules refuse it, a
 * VIN or an IČO is taken, an owner is no Zákazník, or PostgreSQL fails. Every part is checked against the
 * rules before any is written, so every reason of the rules comes back at once; a taken IČO or VIN and an
 * owner that is no Zákazník are found while saving, one after the other, so only the first of them comes
 * back. Each part is saved by its own function (createCustomer, createVehicle, createWorkOrder), so the
 * rules of each stay where they are.
 */
export async function createIntake(user: User | null, input: IntakeInput, db: Database = getDb(), now: Date = new Date()): Promise<CreateIntakeResult> {
  assertCan(user, 'work-orders.write');
  const { owner, vehicle: vehicleFields, ...orderFields } = input;
  const newCustomer = 'customer' in owner ? parseCustomer(owner.customer) : undefined;
  const parsedVehicle = parseVehicle(vehicleFields, localYear(now));
  const parsedOrder = parseWorkOrder(orderFields);
  const errors = {
    ...(newCustomer && !newCustomer.ok && { customer: newCustomer.errors }),
    ...(!parsedVehicle.ok && { vehicle: parsedVehicle.errors }),
    ...(!parsedOrder.ok && { workOrder: parsedOrder.errors }),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  try {
    return await db.transaction(async (tx) => {
      let ownerId: string;
      if ('customer' in owner) {
        const saved = await createCustomer(user, owner.customer, tx);
        if (!saved.ok) throw new IntakeRefused({ ok: false, errors: { customer: saved.errors }, existingCustomer: saved.existing });
        ownerId = saved.id;
      } else {
        ownerId = owner.id;
      }

      const savedVehicle = await createVehicle(user, { ...vehicleFields, ownerId }, tx);
      if (!savedVehicle.ok) {
        const { owner: unknownOwner, ...vehicleErrors } = savedVehicle.errors;
        throw new IntakeRefused(unknownOwner ? { ok: false, errors: { owner: unknownOwner } } : { ok: false, errors: { vehicle: vehicleErrors }, existingVehicle: savedVehicle.existing });
      }

      const savedOrder = await createWorkOrder(user, { ...orderFields, vehicleId: savedVehicle.id }, tx, now);
      // The parts were checked, and the Vozidlo and its Majiteľ were just saved: nothing is left to refuse the Zákazka.
      if (!savedOrder.ok) throw new Error(`The Zákazka of an intake was refused: ${JSON.stringify(savedOrder.errors)}`);
      return { ok: true, id: savedOrder.id, number: savedOrder.number };
    });
  } catch (error) {
    if (error instanceof IntakeRefused) return error.refusal;
    throw error;
  }
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Locks the Zákazka until the transaction ends and says whether it may change now: its Položky and its
 * header. The domain's `canEdit` is that one condition for adding, changing and deleting an item and for
 * saving the header; the lock keeps a change from landing after the Zákazka became Hotová or Zrušená.
 */
async function lockForItems(tx: Transaction, workOrderId: string): Promise<'ok' | 'unknown' | 'not-editable'> {
  const [found] = await rowsIfUuid(workOrderId, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, workOrderId)).for('update'));
  if (!found) return 'unknown';
  return canEdit(found.status) ? 'ok' : 'not-editable';
}

export type UpdateHeaderResult = { ok: true } | { ok: false; errors: WorkOrderErrors & { workOrder?: 'unknown' | 'not-editable' } };

/**
 * Saves the header of a Zákazka that is still Rozpracovaná (`canEdit`): the kilometres at intake, the
 * customer's request, the Termín and the note. The status is read under a row lock in the same transaction
 * as the write, so a header cannot land after the Zákazka became Hotová or Zrušená. The customer and the
 * vehicle are not part of it. The admin's alone: whether a mechanik may edit is ledger question 11 (#43).
 */
export async function updateWorkOrderHeader(user: User | null, id: string, input: WorkOrderInput, db: Database = getDb()): Promise<UpdateHeaderResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseWorkOrder(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const locked = await lockForItems(tx, id);
    if (locked !== 'ok') return { ok: false, errors: { workOrder: locked } };
    await tx.update(workOrder).set(parsed.workOrder).where(eq(workOrder.id, id));
    return { ok: true };
  });
}

export type AddItemResult =
  | { ok: true; id: string }
  | { ok: false; errors: ItemErrors & { workOrder?: 'unknown' | 'not-editable' } };

/** The one place an item is added to a Zákazka, for every way of adding one: under lockForItems, so a Zákazka that is no longer Rozpracovaná takes none. */
async function insertItem(
  tx: Transaction,
  workOrderId: string,
  item: WorkOrderItem,
): Promise<{ ok: true; id: string } | { ok: false; errors: { workOrder: 'unknown' | 'not-editable' } }> {
  const locked = await lockForItems(tx, workOrderId);
  if (locked !== 'ok') return { ok: false, errors: { workOrder: locked } };
  const [saved] = await tx.insert(workOrderItem).values({ workOrderId, ...item }).returning({ id: workOrderItem.id });
  return { ok: true, id: saved!.id };
}

/**
 * Adds a Práca or a Diel to a Zákazka that is still Rozpracovaná. The item keeps the VAT rate it has now: one of the
 * rates of Nastavenia, the default one when none is given (read with getRates, so a Rola that may write work but
 * not read Nastavenia is refused), and a later change of the rates leaves the item alone.
 */
export async function addItem(user: User | null, workOrderId: string, input: ItemInput, db: Database = getDb()): Promise<AddItemResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseItem(input, await getRates(user, db));
  if (!parsed.ok) return parsed;

  return db.transaction((tx) => insertItem(tx, workOrderId, parsed.item));
}

export type AddItemFromPriceListResult =
  | { ok: true; id: string }
  | { ok: false; errors: { workOrder?: 'unknown' | 'not-editable'; priceListItem?: 'unknown'; vatRate?: 'not-offered' } };

/**
 * Adds a Položka cenníka to a Zákazka that is still Rozpracovaná, under the lock of the other adds, as an item of
 * quantity 1 (packages/domain/src/price-list). What is added is a copy of its values and refers back to nothing, so a
 * later change or deletion in the Cenník leaves the Zákazka as it is. An item whose VAT rate Nastavenia no longer
 * offer is refused (`vatRate: 'not-offered'`), as a new item with that rate would be; the admin changes the rate of the
 * item in the Cenník and adds it again. The reasons are reported in this order: the item is not in the Cenník, its VAT
 * rate is not offered, the Zákazka is unknown or not Rozpracovaná. Reading the Cenník and Nastavenia is the admin's alone.
 */
export async function addItemFromPriceList(
  user: User | null,
  workOrderId: string,
  priceListItemId: string,
  db: Database = getDb(),
): Promise<AddItemFromPriceListResult> {
  assertCan(user, 'work-orders.write');
  assertCan(user, 'price-list.read');
  const { vatRates } = await getRates(user, db);

  return db.transaction(async (tx) => {
    const [source] = await rowsIfUuid(priceListItemId, tx.select().from(priceListItem).where(eq(priceListItem.id, priceListItemId)));
    if (!source) return { ok: false, errors: { priceListItem: 'unknown' } };
    if (!vatRates.includes(source.vatRate)) return { ok: false, errors: { vatRate: 'not-offered' } };
    return insertItem(tx, workOrderId, workOrderItemFromPriceListItem(source));
  });
}

/**
 * Finds the item that an update or a delete is about, then locks its Zákazka as when adding an item (lockForItems): `unknown`
 * when there is no such item or its Zákazka is gone, `not-editable` when the Zákazka is no longer Rozpracovaná. The item is read
 * before the lock and not again after it, so the caller must not take from it what another change of the item could have changed
 * meanwhile: only its Zákazka and its kind are fixed; the VAT rate is the one it had when it was found.
 */
async function lockItem(
  tx: Transaction,
  itemId: string,
): Promise<{ ok: true; item: { workOrderId: string; kind: ItemKind; vatRate: number } } | { ok: false; error: 'unknown' | 'not-editable' }> {
  const [item] = await rowsIfUuid(
    itemId,
    tx.select({ workOrderId: workOrderItem.workOrderId, kind: workOrderItem.kind, vatRate: workOrderItem.vatRate }).from(workOrderItem).where(eq(workOrderItem.id, itemId)),
  );
  if (!item) return { ok: false, error: 'unknown' };
  const locked = await lockForItems(tx, item.workOrderId);
  return locked === 'ok' ? { ok: true, item } : { ok: false, error: locked };
}

export type UpdateItemResult =
  | { ok: true; workOrderId: string }
  | { ok: false; errors: ItemErrors & { item?: 'unknown'; workOrder?: 'not-editable' } };

/**
 * Replaces what the form of an item sends, on a Zákazka that is still Rozpracovaná: the kind of the item stays. What is
 * left out is as when adding, except a VAT rate, which stays the one the item has. That rate is allowed even when
 * Nastavenia no longer offer it, so an old item can still be edited; any other must be one they offer.
 */
export async function updateItem(user: User | null, itemId: string, input: Omit<ItemInput, 'kind'>, db: Database = getDb()): Promise<UpdateItemResult> {
  assertCan(user, 'work-orders.write');
  const { vatRates } = await getRates(user, db);

  return db.transaction(async (tx) => {
    const found = await lockItem(tx, itemId);
    if (!found.ok) return { ok: false, errors: found.error === 'unknown' ? { item: 'unknown' } : { workOrder: found.error } };
    const { item } = found;
    const parsed = parseItem({ ...input, kind: item.kind }, { defaultVatRate: item.vatRate, vatRates: vatRatesKeeping(vatRates, item.vatRate) });
    if (!parsed.ok) return parsed;
    const [saved] = await tx.update(workOrderItem).set(parsed.item).where(eq(workOrderItem.id, itemId)).returning({ id: workOrderItem.id });
    return saved ? { ok: true, workOrderId: item.workOrderId } : { ok: false, errors: { item: 'unknown' } }; // none: deleted while this waited for the lock
  });
}

export type DeleteItemResult = { ok: true; workOrderId: string } | { ok: false; error: 'unknown' | 'not-editable' };

/** Deletes an item of a Zákazka that is still Rozpracovaná, under the same lock as adding one. */
export async function deleteItem(user: User | null, itemId: string, db: Database = getDb()): Promise<DeleteItemResult> {
  assertCan(user, 'work-orders.write');
  return db.transaction(async (tx) => {
    const found = await lockItem(tx, itemId);
    if (!found.ok) return found;
    const deleted = await tx.delete(workOrderItem).where(eq(workOrderItem.id, itemId)).returning({ id: workOrderItem.id });
    return deleted.length > 0 ? { ok: true, workOrderId: found.item.workOrderId } : { ok: false, error: 'unknown' }; // none: deleted while this waited for the lock
  });
}

export type ChangeStatusResult = { ok: true } | { ok: false; error: 'unknown' | 'not-allowed' | 'confirmation-required' };

/**
 * The admin takes a Zákazka to the status `to`: the domain's transition table decides, under a row lock,
 * so two clicks at once change it once. Hotová stores the Dátum dokončenia (every time), the other
 * statuses leave it as it is. Zrušená needs `confirmed`. Whether a mechanik may do this is ledger
 * question 11 (#43), so it is `work-orders.write`, the admin's alone.
 */
export async function changeWorkOrderStatus(
  user: User | null,
  id: string,
  { to, confirmed }: { to: WorkOrderStatus; confirmed?: boolean },
  db: Database = getDb(),
  now: Date = new Date(),
): Promise<ChangeStatusResult> {
  assertCan(user, 'work-orders.write');
  return db.transaction(async (tx) => {
    const [found] = await rowsIfUuid(id, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, id)).for('update'));
    if (!found) return { ok: false, error: 'unknown' };
    const changed = transition(found.status, to, 'user', now, { confirmed });
    if (!changed.ok) return changed;
    await tx.update(workOrder).set({ status: changed.status, completedOn: changed.completedOn }).where(eq(workOrder.id, id));
    return { ok: true };
  });
}

/** The columns of a row in the list of Zákazky: the Zákazka itself, its customer and its vehicle. */
const listedFields = {
  id: workOrder.id,
  number: workOrder.number,
  status: workOrder.status,
  deadline: workOrder.deadline,
  customer: { id: customer.id, name: customer.name },
  vehicle: { id: vehicle.id, vin: vehicle.vin, licensePlate: vehicle.licensePlate, make: vehicle.make, model: vehicle.model },
};

/** Zákazky joined to their customer and vehicle, selecting the listed fields and `more`. */
const selectListed = <More extends SelectedFields>(db: Database, more: More) =>
  db
    .select({ ...listedFields, ...more })
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id));

/**
 * A page of the list of Zákazky with their customer, vehicle and Termín, newest first. `status`, `from`
 * and `to` are the filter as the address carries it (the domain's parseListFilter reads them, and the
 * result says which filter it applied): a status, Neuzavreté by default, and the days of intake from
 * and to, both included, by the calendar of Europe/Bratislava. `page` counts from 1 and is read by
 * pageWindow: any page past the last is the last, and anything that is not a page number is the first.
 * The mechanik may read it.
 */
export async function listWorkOrders(
  user: User | null,
  { status, from, to, page = 1 }: { status?: string; from?: string; to?: string; page?: number } = {},
  db: Database = getDb(),
) {
  assertCan(user, 'work-orders.list');
  const filter = parseListFilter({ status, from, to });
  const dayOfIntake = sql`(${workOrder.createdAt} at time zone 'Europe/Bratislava')::date`;
  const matching = and(
    inArray(workOrder.status, [...statusesOf(filter.status)]),
    filter.from ? sql`${dayOfIntake} >= ${filter.from}::date` : undefined,
    filter.to ? sql`${dayOfIntake} <= ${filter.to}::date` : undefined,
  );

  const [counted] = await db.select({ total: count() }).from(workOrder).where(matching);
  const orderCount = counted!.total;
  const { page: current, pageCount, limit, offset } = pageWindow(orderCount, page);
  const orders = await selectListed(db, {}).where(matching).orderBy(desc(workOrder.createdAt), desc(workOrder.number)).limit(limit).offset(offset);
  return { orders, page: current, pageCount, orderCount, filter };
}

/**
 * Every Zákazka of a Vozidlo in any Stav, newest first, each with its own Zákazník, who is not
 * always the Majiteľ the Vozidlo has now. Nothing is found for an id that is no Vozidlo.
 */
export async function listWorkOrdersOfVehicle(user: User | null, vehicleId: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  return rowsIfUuid(vehicleId, selectListed(db, {}).where(eq(workOrder.vehicleId, vehicleId)).orderBy(desc(workOrder.createdAt)));
}

/**
 * The Zákazky made for a Zákazník, in any Stav, newest first, each with its customer and vehicle. A Zákazka
 * belongs to the customer it was made for, so the Zákazky of other customers on his vehicles are not here,
 * and after a Prepis the Zákazky stay with the customer they were made for.
 */
export async function listWorkOrdersOfCustomer(user: User | null, customerId: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  if (!isUuid(customerId)) return [];
  return selectListed(db, {}).where(eq(workOrder.customerId, customerId)).orderBy(desc(workOrder.createdAt));
}

/** One Zákazka with its items, the amounts of each, the totals and the Marža, or null when there is none with this id. */
export async function getWorkOrder(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  if (!isUuid(id)) return null;
  const [found] = await selectListed(db, {
    completedOn: workOrder.completedOn,
    mileageKm: workOrder.mileageKm,
    customerRequest: workOrder.customerRequest,
    note: workOrder.note,
  }).where(eq(workOrder.id, id));
  if (!found) return null;
  const items = await db.select(itemColumns).from(workOrderItem).where(eq(workOrderItem.workOrderId, id)).orderBy(...inOrderAdded);
  return { ...found, ...withAmounts(items), margin: marginOf(items) };
}
