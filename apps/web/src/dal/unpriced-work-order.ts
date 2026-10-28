import type { ItemKind, WorkOrderStatus } from '@servisnik/domain/work-order';
import { asc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle, workOrder, workOrderItem } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/**
 * What the mechanik reads of a Zákazka (spec #95, Mechanik): the list of the fields he may have, and no other. A field
 * is only in the answer when it is selected below, so a price, a sum, VAT, a margin, a discount or an invoice that
 * is added to the table never reaches him, and a field added here is added for him: test/unpriced-work-order.test.ts
 * looks for a price key in the whole answer. The ids of the customer and of the vehicle are left out because the
 * pages they open are not his.
 */
export type UnpricedWorkOrder = {
  id: string;
  number: string;
  status: WorkOrderStatus;
  customer: { name: string };
  vehicle: { vin: string; licensePlate: string | null; make: string; model: string };
  mileageKm: number;
  customerRequest: string;
  deadline: string | null;
  note: string | null;
  items: { kind: ItemKind; code: string | null; name: string; quantityHundredths: number; unit: string }[];
};

/**
 * One Zákazka in any Stav as the mechanik reads it, with its items in the order they were added, or null when there
 * is none with this id. The admin may read it too, but he has `getWorkOrder` with the prices.
 */
export async function getUnpricedWorkOrder(user: User | null, id: string, db: Database = getDb()): Promise<UnpricedWorkOrder | null> {
  assertCan(user, 'work-orders.read-unpriced');
  if (!isUuid(id)) return null;
  const [found] = await db
    .select({
      id: workOrder.id,
      number: workOrder.number,
      status: workOrder.status,
      customer: { name: customer.name },
      vehicle: { vin: vehicle.vin, licensePlate: vehicle.licensePlate, make: vehicle.make, model: vehicle.model },
      mileageKm: workOrder.mileageKm,
      customerRequest: workOrder.customerRequest,
      deadline: workOrder.deadline,
      note: workOrder.note,
    })
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id))
    .where(eq(workOrder.id, id));
  if (!found) return null;
  const items = await db
    .select({
      kind: workOrderItem.kind,
      code: workOrderItem.code,
      name: workOrderItem.name,
      quantityHundredths: workOrderItem.quantityHundredths,
      unit: workOrderItem.unit,
    })
    .from(workOrderItem)
    .where(eq(workOrderItem.workOrderId, id))
    .orderBy(asc(workOrderItem.createdAt), asc(workOrderItem.id));
  return { ...found, items };
}
