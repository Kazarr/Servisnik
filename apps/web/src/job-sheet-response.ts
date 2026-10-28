import { printFileName } from '@servisnik/domain/print';
import { localDate } from '@servisnik/domain/work-order';
import { getJobSheet } from './dal/job-sheet.ts';
import { getLogo } from './dal/logo.ts';
import type { User } from './dal/user.ts';
import { getWorkshopDetails } from './dal/workshop.ts';
import type { Database } from './db/index.ts';
import { jobSheetDocument } from './print/job-sheet.ts';
import { printPdf } from './print/pdf.ts';
import { failure, guarded } from './route-guard.ts';

// The answer of the Route Handler of the zákazkový list (app/(app)/zakazky/[id]/zakazkovy-list/route.ts), which
// only finds the user in the session. A PDF belongs to a Route Handler, not a Server Action (docs/adr/0001-stack.md).

/**
 * The zákazkový list of a Zákazka as a PDF download, printed with the day `now` in Europe/Bratislava. Every
 * signed-in user may have it, the mechanik too: it holds no price. The capability is asked before anything is
 * read: a request whose session the route cannot find (an expired or forged cookie) gets a 401, and an id that is
 * no Zákazka a 404. A request with no session cookie at all never gets here: the proxy sends it to the login page
 * with a 307 (src/proxy.ts), which e2e/job-sheet.spec.ts checks.
 */
export const jobSheetResponse = (user: User | null, workOrderId: string, db: Database, now: Date = new Date()) =>
  guarded(async () => {
    const sheet = await getJobSheet(user, workOrderId, db);
    if (!sheet) return failure('Zákazka neexistuje.', 404);
    const [workshop, logo] = await Promise.all([getWorkshopDetails(user, db), getLogo(user, db)]);
    const pdf = await printPdf(jobSheetDocument({ sheet, workshop, logo, printedOn: localDate(now) }));
    return new Response(pdf as Uint8Array<ArrayBuffer>, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${printFileName(sheet.number, 'jobSheet')}"`,
        // The PDF holds a customer's data: no shared cache keeps it, and a browser takes it for nothing else.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
