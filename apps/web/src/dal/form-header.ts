import { eq } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import type { Database } from '../db/index.ts';
import { customer, vehicle, workOrder } from '../db/schema.ts';
import { isUuid } from './uuid.ts';

// What every printed form says first about a Zákazka (job-sheet.ts, print-forms.ts), read and typed in one place.
// It asks no capability: the form that reads it does, before it calls this.

/** The number of a Zákazka, the customer it was made for and the vehicle: the part of a form that is the same on all of them. */
export type FormHeader = {
  number: string;
  customer: Pick<typeof customer.$inferSelect, 'name'>;
  vehicle: Pick<typeof vehicle.$inferSelect, 'vin' | 'licensePlate' | 'make' | 'model'>;
};

/** The `FormHeader` of a Zákazka and the columns `more`; null when there is no such Zákazka. */
export async function readFormHeader<More extends SelectedFields>(workOrderId: string, db: Database, more: More) {
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
