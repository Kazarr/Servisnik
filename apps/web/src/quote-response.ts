import { getQuote } from './dal/print-forms.ts';
import type { User } from './dal/user.ts';
import type { Database } from './db/index.ts';
import { quoteDocument } from './print/quote.ts';
import { printedFormResponse } from './print-response.ts';

// The answer of the Route Handler of the cenová ponuka (app/(app)/zakazky/[id]/cenova-ponuka/route.ts), which only
// finds the user in the session. The answer itself is the one of every printed form (print-response.ts).

/** The cenová ponuka of a Zákazka as a PDF download. It has the prices, so it is the admin's alone: any other Rola gets a 403. */
export const quoteResponse = (user: User | null, workOrderId: string, db: Database, now: Date = new Date()) =>
  printedFormResponse(
    { form: 'quote', read: getQuote, document: ({ data: quote, workshop, logo, printedOn }) => quoteDocument({ quote, workshop, logo, printedOn }) },
    user,
    workOrderId,
    db,
    now,
  );
