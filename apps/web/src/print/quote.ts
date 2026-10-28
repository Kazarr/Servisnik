import type { WorkshopDetails } from '@servisnik/domain/workshop';
import type { Logo } from '../dal/logo.ts';
import type { Quote } from '../dal/print-forms.ts';
import { formatEuro, formatQuantity } from '../format.ts';
import { printedDocument } from './document.ts';
import { html } from './html.ts';

const amount = (cents: number) => html`<td class="amount">${formatEuro(cents)}</td>`;

const itemRow = ({ code, name, quantityHundredths, unit, unitPriceCents, vatRate, amounts }: Quote['items'][number]) => html`
<tr>
  <td>${code && html`<span class="code">${code}</span> `}${name}</td>
  <td class="amount">${formatQuantity(quantityHundredths)} ${unit}</td>
  ${amount(unitPriceCents)}
  <td class="amount">${vatRate} %</td>
  ${amount(amounts.net)}
  ${amount(amounts.gross)}
</tr>`;

const itemsTable = (items: Quote['items']) => html`
<table class="lines">
  <thead>
    <tr>
      <th scope="col">Názov</th>
      <th scope="col" class="amount">Množstvo</th>
      <th scope="col" class="amount">Cena za jednotku bez DPH</th>
      <th scope="col" class="amount">Sadzba DPH</th>
      <th scope="col" class="amount">Suma bez DPH</th>
      <th scope="col" class="amount">Suma s DPH</th>
    </tr>
  </thead>
  <tbody>${items.map(itemRow)}</tbody>
</table>`;

/**
 * The HTML of the Cenová ponuka (GLOSSARY) the customer gets before the repair: the frame of every form, then the
 * items with their prices without VAT per unit, their VAT rates and their amounts without and with VAT, and the
 * sums of the Zákazka. Every number is the one the Data Access Layer read from the domain; the form adds nothing
 * up. It has no Nákupná cena, no Marža and no number of its own: it carries the number of the Zákazka.
 */
export const quoteDocument = ({ quote, workshop, logo, printedOn }: { quote: Quote; workshop: WorkshopDetails; logo: Logo | null; printedOn: string }) =>
  printedDocument(
    { title: 'Cenová ponuka', number: quote.number, printedOn, workshop, logo, customer: quote.customer, vehicle: quote.vehicle },
    html`
<section class="items">
  <h2>Položky</h2>
  ${quote.items.length > 0 ? itemsTable(quote.items) : html`<p>Zákazka zatiaľ nemá žiadne položky.</p>`}
</section>
<section class="totals">
  <dl class="facts">
    <div><dt>Spolu bez DPH</dt><dd>${formatEuro(quote.totals.net)}</dd></div>
    <div><dt>DPH</dt><dd>${formatEuro(quote.totals.vat)}</dd></div>
    <div class="grand"><dt>Spolu s DPH</dt><dd>${formatEuro(quote.totals.gross)}</dd></div>
  </dl>
</section>`,
  );
