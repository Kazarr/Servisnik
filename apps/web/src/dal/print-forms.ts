import { canPrintHandover, type Amounts, type ItemKind } from '@servisnik/domain/work-order';
import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { workOrder, workOrderItem } from '../db/schema.ts';
import { readFormHeader, type FormHeader } from './form-header.ts';
import { assertCan, type User } from './user.ts';
import { inOrderAdded, withAmounts } from './work-order-items.ts';

// The data of the two forms the admin alone prints, next to the zákazkový list (job-sheet.ts). Each form reads
// its own columns of the items and no others, so what a form must not show is never read.

/**
 * What the Cenová ponuka (GLOSSARY) prints about a Zákazka: the customer it was made for, the vehicle, the items
 * with their prices without VAT per unit, their VAT rates and the amounts of each, and the sums of the Zákazka.
 * The amounts and the sums are the domain's (`amountsOf`, `totalsOf`), so the form adds nothing up itself.
 * It has no Nákupná cena and no Marža, which the customer does not get, and no internal note.
 */
export type Quote = FormHeader & {
  items: { code: string | null; name: string; quantityHundredths: number; unit: string; salePriceCents: number; vatRate: number; amounts: Amounts }[];
  totals: Amounts;
};

/** The data of the cenová ponuka of a Zákazka in any Stav, or null when there is no Zákazka with this id. The admin's alone. */
export async function getQuote(user: User | null, workOrderId: string, db: Database = getDb()): Promise<Quote | null> {
  assertCan(user, 'work-orders.quote');
  const formHeader = await readFormHeader(workOrderId, db, {});
  if (!formHeader) return null;
  const items = await db
    .select({
      code: workOrderItem.code,
      name: workOrderItem.name,
      quantityHundredths: workOrderItem.quantityHundredths,
      unit: workOrderItem.unit,
      salePriceCents: workOrderItem.salePriceCents,
      vatRate: workOrderItem.vatRate,
    })
    .from(workOrderItem)
    .where(eq(workOrderItem.workOrderId, workOrderId))
    .orderBy(...inOrderAdded);
  return { ...formHeader, ...withAmounts(items) };
}

/**
 * What the Odovzdávací protokol (GLOSSARY) prints about a Zákazka: the customer it was made for, the vehicle, the
 * kilometres at intake and at handover (none until the admin entered them) and the work and parts with their
 * quantities and units. It holds no price, sum, VAT or discount, and no internal note: the test of this read fails
 * on any price key in the whole answer, so a price field cannot be added here by mistake.
 */
export type HandoverProtocol = FormHeader & {
  mileageKm: number;
  handoverMileageKm: number | null;
  items: { kind: ItemKind; code: string | null; name: string; quantityHundredths: number; unit: string }[];
};

/**
 * The data of the odovzdávací protokol of a Zákazka that is Hotová or Vyfakturovaná (`canPrintHandover`: the customer takes
 * the vehicle over), or null when there is no Zákazka with this id, or `'wrong-status'` when there is one in another Stav:
 * its form header is read to tell, but nothing of it is returned and no item is read (nor, in the response, the workshop or
 * the logo). The admin's alone.
 */
export async function getHandoverProtocol(user: User | null, workOrderId: string, db: Database = getDb()): Promise<HandoverProtocol | 'wrong-status' | null> {
  assertCan(user, 'work-orders.handover');
  const found = await readFormHeader(workOrderId, db, { mileageKm: workOrder.mileageKm, handoverMileageKm: workOrder.handoverMileageKm, status: workOrder.status });
  if (!found) return null;
  const { status, ...formHeader } = found;
  if (!canPrintHandover(status)) return 'wrong-status';
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
  return { ...formHeader, items };
}
