import { getJobSheet } from './dal/job-sheet.ts';
import type { User } from './dal/user.ts';
import type { Database } from './db/index.ts';
import { jobSheetDocument } from './print/job-sheet.ts';
import { printedFormResponse } from './print-response.ts';

// The answer of the Route Handler of the zákazkový list (app/(app)/zakazky/[id]/zakazkovy-list/route.ts), which
// only finds the user in the session. The answer itself is the one of every printed form (print-response.ts).

/**
 * The zákazkový list of a Zákazka as a PDF download. Every signed-in user may have it, the mechanik too: it
 * holds no price.
 */
export const jobSheetResponse = (user: User | null, workOrderId: string, db: Database, now: Date = new Date()) =>
  printedFormResponse(
    { form: 'jobSheet', read: getJobSheet, document: ({ data: sheet, workshop, logo, printedOn }) => jobSheetDocument({ sheet, workshop, logo, printedOn }) },
    user,
    workOrderId,
    db,
    now,
  );
