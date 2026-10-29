import { getHandoverProtocol } from './dal/print-forms.ts';
import type { User } from './dal/user.ts';
import type { Database } from './db/index.ts';
import { handoverProtocolDocument } from './print/handover-protocol.ts';
import { printedFormResponse } from './print-response.ts';
import { failure } from './route-guard.ts';

// The answer of the Route Handler of the odovzdávací protokol (app/(app)/zakazky/[id]/odovzdavaci-protokol/route.ts),
// which only finds the user in the session. The answer itself is the one of every printed form (print-response.ts).

/** What the one who asks for the protocol of a Zákazka that is not Hotová or Vyfakturovaná is told. */
const wrongStatusMessage = 'Odovzdávací protokol sa tlačí len pre zákazku v stave Hotová alebo Vyfakturovaná.';

/**
 * The odovzdávací protokol of a Zákazka as a PDF download. It is the admin's alone: any other Rola gets a 403. It is
 * printed when the customer takes the vehicle over, so a Zákazka that is not Hotová or Vyfakturovaná gets a 409.
 */
export const handoverProtocolResponse = (user: User | null, workOrderId: string, db: Database, now: Date = new Date()) =>
  printedFormResponse(
    {
      form: 'handoverProtocol',
      read: async (readBy, id, readFrom) => {
        const protocol = await getHandoverProtocol(readBy, id, readFrom);
        return protocol === 'wrong-status' ? failure(wrongStatusMessage, 409) : protocol;
      },
      document: ({ data: protocol, workshop, logo, printedOn }) => handoverProtocolDocument({ protocol, workshop, logo, printedOn }),
    },
    user,
    workOrderId,
    db,
    now,
  );
