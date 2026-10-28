import type { WorkshopDetails } from '@servisnik/domain/workshop';
import type { Logo } from '../dal/logo.ts';
import type { JobSheet } from '../dal/job-sheet.ts';
import { formatWhole } from '../format.ts';
import { printedDocument } from './document.ts';
import { html } from './html.ts';

/**
 * The HTML of the Zákazkový list (GLOSSARY) the customer signs at intake: the frame of every form, then the
 * kilometres, the Termín, the request of the customer and the line for his signature. It has no price.
 * The Termín is a line to write on until the Zákazka has a date for it.
 */
export const jobSheetDocument = ({ sheet, workshop, logo, printedOn }: { sheet: JobSheet; workshop: WorkshopDetails; logo: Logo | null; printedOn: string }) =>
  printedDocument(
    { title: 'Zákazkový list', number: sheet.number, printedOn, workshop, logo, customer: sheet.customer, vehicle: sheet.vehicle },
    html`
<section>
  <dl class="facts">
    <div><dt>Kilometre pri príjme</dt><dd>${formatWhole(sheet.mileageKm)} km</dd></div>
    <div><dt>Termín</dt><dd><span class="write-line"></span></dd></div>
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
