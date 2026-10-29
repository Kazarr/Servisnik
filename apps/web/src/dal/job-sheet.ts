import { getDb, type Database } from '../db/index.ts';
import { workOrder } from '../db/schema.ts';
import { readHeader, type FormHeader } from './form-header.ts';
import { assertCan, type User } from './user.ts';

/**
 * What the Zákazkový list prints about a Zákazka (GLOSSARY): the customer it was made for, the vehicle,
 * the kilometres at intake, the Termín (a day `YYYY-MM-DD`, or none) and the customer's request. The mechanik
 * prints it, so it holds no price, sum, VAT or discount, and a field added here is added for him too (his detail
 * of a Zákazka is unpriced-work-order.ts). The internal note stays out: it goes on no document.
 */
export type JobSheet = FormHeader & {
  mileageKm: number;
  deadline: string | null;
  customerRequest: string;
};

/** The data of the zákazkový list of a Zákazka in any Stav, or null when there is no Zákazka with this id. */
export async function getJobSheet(user: User | null, workOrderId: string, db: Database = getDb()): Promise<JobSheet | null> {
  assertCan(user, 'work-orders.job-sheet');
  return readHeader(workOrderId, db, { mileageKm: workOrder.mileageKm, deadline: workOrder.deadline, customerRequest: workOrder.customerRequest });
}
