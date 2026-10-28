import type { WorkshopDetails } from '@servisnik/domain/workshop';
import type { Logo } from '../dal/logo.ts';
import { formatDate } from '../format.ts';
import { html, Html } from './html.ts';
import { documentCss } from './styles.ts';

// The frame every printed form shares: the header with the logo and the details of the autoservis, the
// number of the Zákazka and the day of the print, then the customer and the vehicle. A form puts what is its
// own under that (job-sheet.ts).

export type DocumentFrame = {
  /** The name of the form, e.g. "Zákazkový list". */
  title: string;
  /** The number of the Zákazka, which every form carries. */
  number: string;
  /** The day of the print, `YYYY-MM-DD`. */
  printedOn: string;
  workshop: WorkshopDetails;
  logo: Logo | null;
  customer: { name: string };
  vehicle: { vin: string; licensePlate: string | null; make: string; model: string };
};

const joined = (parts: (string | null)[], separator: string) => parts.filter(Boolean).join(separator);

/** The lines under the name of the autoservis: the address, the identifiers, the contacts, the IBAN and the register; none for what is not filled in. */
function workshopLines({ street, city, postalCode, ico, dic, icDph, phone, email, iban, commercialRegister }: WorkshopDetails) {
  const lines = [
    joined([street, joined([postalCode, city], ' ')], ', '),
    joined([ico && `IČO: ${ico}`, dic && `DIČ: ${dic}`, icDph && `IČ DPH: ${icDph}`], ' · '),
    joined([phone && `Tel.: ${phone}`, email && `E-mail: ${email}`], ' · '),
    iban && `IBAN: ${iban}`,
    commercialRegister,
  ];
  return lines.filter(Boolean);
}

/** The logo as part of the page, so that printing loads nothing from anywhere. */
const logoImage = (logo: Logo) => html`<img class="logo" src="data:${logo.contentType};base64,${Buffer.from(logo.bytes).toString('base64')}" alt="">`;

const letterhead = ({ title, number, printedOn, workshop, logo }: DocumentFrame) => html`
<header class="letterhead">
  <div class="workshop">
    ${logo && logoImage(logo)}
    <div class="workshop-details">
      <p class="workshop-name">${workshop.name}</p>
      ${workshopLines(workshop).map((line) => html`<p>${line}</p>`)}
    </div>
  </div>
  <div class="identity">
    <h1>${title}</h1>
    <dl class="facts">
      <div><dt>Číslo zákazky</dt><dd>${number}</dd></div>
      <div><dt>Dátum tlače</dt><dd>${formatDate(printedOn)}</dd></div>
    </dl>
  </div>
</header>`;

const parties = ({ customer, vehicle }: DocumentFrame) => html`
<section class="parties">
  <div class="party">
    <h2>Zákazník</h2>
    <p class="party-name">${customer.name}</p>
  </div>
  <div class="party">
    <h2>Vozidlo</h2>
    <p class="party-name">${vehicle.make} ${vehicle.model}</p>
    <dl class="facts">
      <div><dt>VIN</dt><dd>${vehicle.vin}</dd></div>
      <div><dt>ŠPZ</dt><dd>${vehicle.licensePlate || '—'}</dd></div>
    </dl>
  </div>
</section>`;

/**
 * A whole HTML document for Chromium: the frame, then `content`, which a form builds with `html`. The page
 * runs no script and loads nothing from outside (its policy says so, and the printer turns scripts off too).
 */
export function printedDocument(frame: DocumentFrame, content: Html): string {
  return html`<!doctype html><html lang="sk"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${frame.title} ${frame.number}</title>
<style>${new Html(documentCss)}</style>
</head><body>
${letterhead(frame)}
${parties(frame)}
<main>${content}</main>
</body></html>`.text;
}
