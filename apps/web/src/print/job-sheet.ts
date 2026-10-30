import type { JobSheet } from '../dal/job-sheet.ts';
import { formatDate, formatWhole } from '../format.ts';
import type { PrintedInput } from '../print-response.ts';
import { printedDocument } from './document.ts';
import { html } from './html.ts';

/**
 * The HTML of the Zákazkový list (GLOSSARY) the customer signs at intake: the frame of every form, then the
 * kilometres, the Termín, the request of the customer and the line for his signature. It has no price.
 * A Zákazka without a Termín gets a line to write it on.
 */
export const jobSheetDocument = ({
  sheet,
  workshop,
  logo,
  letterhead,
  printedOn,
}: Omit<PrintedInput<JobSheet>, 'data'> & { sheet: JobSheet }) =>
  printedDocument(
    { title: 'Zákazkový list', number: sheet.number, printedOn, workshop, logo, letterhead, customer: sheet.customer, vehicle: sheet.vehicle },
    html`
<section>
  <dl class="facts">
    <div><dt>Kilometre pri príjme</dt><dd>${formatWhole(sheet.mileageKm)} km</dd></div>
    <div><dt>Termín</dt><dd>${sheet.deadline ? formatDate(sheet.deadline) : html`<span class="write-line"></span>`}</dd></div>
  </dl>
</section>
<section>
  <h2>Požiadavka zákazníka</h2>
  <p class="request">${sheet.customerRequest}</p>
</section>
<section class="signature">
  <p class="signature-line">Podpis zákazníka</p>
</section>`,
  );
