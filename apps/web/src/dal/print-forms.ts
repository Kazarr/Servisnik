import { amountsOf, totalsOf, type Amounts, type ItemKind } from '@servisnik/domain/work-order';
import { asc, eq } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle, workOrder, workOrderItem } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

// The data of the two forms the admin alone prints, next to the zákazkový list (job-sheet.ts). Each form reads
// its own columns of the items and no others, so what a form must not show is never read.

/** The number, the customer it was made for and the vehicle of a Zákazka, and the columns `more`; null when there is no such Zákazka. */
async function readHeader<More extends SelectedFields>(workOrderId: string, db: Database, more: More) {
  if (!isUuid(workOrderId)) return null;
  const [found] = await db
    .select({
      number: workOrder.number,
      customer: { name: customer.name },
      vehicle: { vin: vehicle.vin, licensePlate: vehicle.licensePlate, make: vehicle.make, model: vehicle.model },
      ...more,
    })
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id))
    .where(eq(workOrder.id, workOrderId));
  return found ?? null;
}

const inOrderAdded = [asc(workOrderItem.createdAt), asc(workOrderItem.id)];

/**
 * What the Cenová ponuka (GLOSSARY) prints about a Zákazka: the customer it was made for, the vehicle, the items
 * with their prices without VAT per unit, their VAT rates and the amounts of each, and the sums of the Zákazka.
 * The amounts and the sums are the domain's (`amountsOf`, `totalsOf`), so the form adds nothing up itself.
 * It has no Nákupná cena and no Marža, which the customer does not get, and no internal note.
 */
export type Quote = {
  number: string;
  customer: { name: string };
  vehicle: { vin: string; licensePlate: string | null; make: string; model: string };
  items: { code: string | null; name: string; quantityHundredths: number; unit: string; unitPriceCents: number; vatRate: number; amounts: Amounts }[];
  totals: Amounts;
};

/** The data of the cenová ponuka of a Zákazka in any Stav, or null when there is no Zákazka with this id. The admin's alone. */
export async function getQuote(user: User | null, workOrderId: string, db: Database = getDb()): Promise<Quote | null> {
  assertCan(user, 'work-orders.quote');
  const header = await readHeader(workOrderId, db, {});
  if (!header) return null;
  const items = await db
    .select({
      code: workOrderItem.code,
      name: workOrderItem.name,
      quantityHundredths: workOrderItem.quantityHundredths,
      unit: workOrderItem.unit,
      unitPriceCents: workOrderItem.unitPriceCents,
      vatRate: workOrderItem.vatRate,
    })
    .from(workOrderItem)
    .where(eq(workOrderItem.workOrderId, workOrderId))
    .orderBy(...inOrderAdded);
  return { ...header, items: items.map((item) => ({ ...item, amounts: amountsOf(item) })), totals: totalsOf(items) };
}

/**
 * What the Odovzdávací protokol (GLOSSARY) prints about a Zákazka: the customer it was made for, the vehicle, the
 * kilometres at intake and the work and parts with their quantities and units. It holds no price, sum, VAT or
 * discount, and no internal note: the test of this read fails on any price key in the whole answer, so a price
 * field cannot be added here by mistake.
 */
export type HandoverProtocol = {
  number: string;
  customer: { name: string };
  vehicle: { vin: string; licensePlate: string | null; make: string; model: string };
  mileageKm: number;
  items: { kind: ItemKind; code: string | null; name: string; quantityHundredths: number; unit: string }[];
};

/** The data of the odovzdávací protokol of a Zákazka in any Stav, or null when there is no Zákazka with this id. The admin's alone. */
export async function getHandoverProtocol(user: User | null, workOrderId: string, db: Database = getDb()): Promise<HandoverProtocol | null> {
  assertCan(user, 'work-orders.handover');
  const header = await readHeader(workOrderId, db, { mileageKm: workOrder.mileageKm });
  if (!header) return null;
  const items = await db
    .select({
      kind: workOrderItem.kind,
      code: workOrderItem.code,
      name: workOrderItem.name,
      quantityHundredths: workOrderItem.quantityHundredths,
      unit: workOrderItem.unit,
    })
    .from(workOrderItem)
    .where(eq(workOrderItem.workOrderId, workOrderId))
    .orderBy(...inOrderAdded);
  return { ...header, items };
}
