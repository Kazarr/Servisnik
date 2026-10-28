import { getJobSheet } from './dal/job-sheet.ts';
import type { User } from './dal/user.ts';
import type { Database } from './db/index.ts';
import { jobSheetDocument } from './print/job-sheet.ts';
import { printedFormResponse } from './print-response.ts';

// The answer of the Route Handler of the zákazkový list (app/(app)/zakazky/[id]/zakazkovy-list/route.ts), which
// only finds the user in the session. The answer itself is the one of every printed form (print-response.ts).

/**
 * The zákazkový list of a Zákazka as a PDF download, printed with the day `now` in Europe/Bratislava. Every
 * signed-in user may have it, the mechanik too: it holds no price. The capability is asked before anything is
 * read: a request whose session the route cannot find (an expired or forged cookie) gets a 401, and an id that is
 * no Zákazka a 404. A request with no session cookie at all never gets here: the proxy sends it to the login page
 * with a 307 (src/proxy.ts), which e2e/job-sheet.spec.ts checks.
 */
export const jobSheetResponse = (user: User | null, workOrderId: string, db: Database, now: Date = new Date()) =>
  printedFormResponse(
    { form: 'jobSheet', read: getJobSheet, document: ({ data: sheet, workshop, logo, printedOn }) => jobSheetDocument({ sheet, workshop, logo, printedOn }) },
    user,
    workOrderId,
    db,
    now,
  );
