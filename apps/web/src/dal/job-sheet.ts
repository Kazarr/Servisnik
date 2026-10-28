import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle, workOrder } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/**
 * What the Zákazkový list prints about a Zákazka (GLOSSARY): the customer it was made for, the vehicle,
 * the kilometres at intake, the Termín (a day `YYYY-MM-DD`, or none) and the customer's request. It is the
 * one read of a Zákazka the mechanik has, so it holds no price, sum, VAT or discount, and a field added
 * here is added for him too. The internal note stays out: it goes on no document.
 */
export type JobSheet = {
  number: string;
  customer: { name: string };
  vehicle: { vin: string; licensePlate: string | null; make: string; model: string };
  mileageKm: number;
  deadline: string | null;
  customerRequest: string;
};

/** The data of the zákazkový list of a Zákazka in any Stav, or null when there is no Zákazka with this id. */
export async function getJobSheet(user: User | null, workOrderId: string, db: Database = getDb()): Promise<JobSheet | null> {
  assertCan(user, 'work-orders.job-sheet');
  if (!isUuid(workOrderId)) return null;
  const [found] = await db
    .select({
      number: workOrder.number,
      customer: { name: customer.name },
      vehicle: { vin: vehicle.vin, licensePlate: vehicle.licensePlate, make: vehicle.make, model: vehicle.model },
      mileageKm: workOrder.mileageKm,
      deadline: workOrder.deadline,
      customerRequest: workOrder.customerRequest,
    })
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id))
    .where(eq(workOrder.id, workOrderId));
  return found ?? null;
}
