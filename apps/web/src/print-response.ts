import { printFileName, type PrintForm } from '@servisnik/domain/print';
import { localDate } from '@servisnik/domain/work-order';
import type { WorkshopDetails } from '@servisnik/domain/workshop';
import { getLogo, type Logo } from './dal/logo.ts';
import type { User } from './dal/user.ts';
import { getWorkshopDetails } from './dal/workshop.ts';
import type { Database } from './db/index.ts';
import { printPdf } from './print/pdf.ts';
import { failure, guarded } from './route-guard.ts';

// What every printed form answers (docs/adr/0001-stack.md: a PDF belongs to a Route Handler, not a Server
// Action). A form brings its read of the Zákazka and its HTML; the capability, the 404, the header and the
// download are the same for all of them.

/** What a form hands the HTML of its document: what it read of the Zákazka, the autoservis, its logo and the day of the print. */
export type PrintedInput<Data> = { data: Data; workshop: WorkshopDetails; logo: Logo | null; printedOn: string };

/**
 * The PDF of a form of a Zákazka as a download, printed with the day `now` in Europe/Bratislava. `read` asks
 * the capability of the form before it reads anything, so nobody signed in gets a 401, a Rola that may not
 * print the form a 403, and an id that is no Zákazka a 404. The details of the autoservis and its logo are read
 * only after that, as the same user.
 */
export const printedFormResponse = <Data extends { number: string }>(
  { form, read, document }: { form: PrintForm; read: (user: User | null, workOrderId: string, db: Database) => Promise<Data | null>; document: (input: PrintedInput<Data>) => string },
  user: User | null,
  workOrderId: string,
  db: Database,
  now: Date,
) =>
  guarded(async () => {
    const data = await read(user, workOrderId, db);
    if (!data) return failure('Zákazka neexistuje.', 404);
    const [workshop, logo] = await Promise.all([getWorkshopDetails(user, db), getLogo(user, db)]);
    const pdf = await printPdf(document({ data, workshop, logo, printedOn: localDate(now) }));
    return new Response(pdf as Uint8Array<ArrayBuffer>, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${printFileName(data.number, form)}"`,
        // The PDF holds a customer's data: no shared cache keeps it, and a browser takes it for nothing else.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
