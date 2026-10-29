import type { WorkshopDetails } from '@servisnik/domain/workshop';
import type { Logo } from '../dal/logo.ts';
import type { HandoverProtocol } from '../dal/print-forms.ts';
import { formatDate, formatQuantity, formatWhole } from '../format.ts';
import { itemKindLabels } from '../item-kind-labels.ts';
import { printedDocument } from './document.ts';
import { html } from './html.ts';

const itemRow = ({ kind, code, name, quantityHundredths, unit }: HandoverProtocol['items'][number]) => html`
<tr>
  <td>${itemKindLabels[kind]}</td>
  <td>${code}</td>
  <td>${name}</td>
  <td class="amount">${formatQuantity(quantityHundredths)} ${unit}</td>
</tr>`;

const itemsTable = (items: HandoverProtocol['items']) => html`
<table class="lines">
  <thead>
    <tr>
      <th scope="col">Druh</th>
      <th scope="col">Kód</th>
      <th scope="col">Názov</th>
      <th scope="col" class="amount">Množstvo</th>
    </tr>
  </thead>
  <tbody>${items.map(itemRow)}</tbody>
</table>`;

/**
 * The HTML of the Odovzdávací protokol (GLOSSARY) that the customer and the autoservis sign when the vehicle is handed
 * over: the frame of every form, then the kilometres at intake, the day of the handover (the day of the print), the
 * work and parts done with their quantities and units, and a line for each signature. It has no price.
 */
export const handoverProtocolDocument = ({
  protocol,
  workshop,
  logo,
  printedOn,
}: {
  protocol: HandoverProtocol;
  workshop: WorkshopDetails;
  logo: Logo | null;
  printedOn: string;
}) =>
  printedDocument(
    { title: 'Odovzdávací protokol', number: protocol.number, printedOn, workshop, logo, customer: protocol.customer, vehicle: protocol.vehicle },
    html`
<section>
  <dl class="facts">
    <div><dt>Kilometre pri príjme</dt><dd>${formatWhole(protocol.mileageKm)} km</dd></div>
    <div><dt>Dátum odovzdania</dt><dd>${formatDate(printedOn)}</dd></div>
  </dl>
</section>
<section class="items">
  <h2>Vykonané práce a diely</h2>
  ${protocol.items.length > 0 ? itemsTable(protocol.items) : html`<p>Zákazka nemá žiadne práce ani diely.</p>`}
</section>
<section class="signatures">
  <p class="signature-line">Podpis zákazníka</p>
  <p class="signature-line">Podpis autoservisu</p>
</section>`,
  );
