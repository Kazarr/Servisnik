import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { forbiddenMessage } from '../src/app/(app)/forbidden.ts';
import { createCustomer } from '../src/dal/customers.ts';
import type { User } from '../src/dal/user.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { saveWorkshopDetails } from '../src/dal/workshop.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder, setHandoverMileage } from '../src/dal/work-orders.ts';
import { handoverProtocolResponse } from '../src/handover-protocol-response.ts';
import { quoteResponse } from '../src/quote-response.ts';
import { watchChromium } from './support/chromium.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { readPdf, type PdfPage } from './support/pdf.ts';
import { truncateTables } from './support/reset.ts';

// The Route Handlers of the cenová ponuka and the odovzdávací protokol (spec #95, Tlačivá; ticket #103): the admin gets the
// PDF of a Zákazka as a download, nobody else does. The route files only find the user in the session; the answers are
// here, printed by the real Chromium (`pnpm e2e:install`). The zákazkový list has its own file (job-sheet-response.test.ts).

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let vehicleId: string;
const { closeAll } = watchChromium();
beforeAll(async () => {
  ctx = await createTestDb();
  await saveWorkshopDetails(
    admin,
    {
      name: 'Autoservis Žilinský',
      street: 'Hlavná 1',
      city: 'Bratislava',
      postalCode: '811 01',
      ico: '12345678',
      dic: '',
      icDph: '',
      vatPayerType: 'nonPayer',
      iban: '',
      phone: '',
      email: '',
      commercialRegister: '',
    },
    ctx.db,
  );
});
afterAll(async () => {
  await closeAll();
  await ctx.close();
});
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer', 'work_order_counter');
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ľubomír Škrabák' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Škoda', model: 'Octavia' }, ctx.db));
});

const newWorkOrder = async () =>
  idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '123 456', customerRequest: 'Výmena oleja', note: 'Interná poznámka dielne' }, ctx.db, new Date('2026-07-15T10:00:00Z')));

/** A Zákazka with the work and the part of the one-page tests: 60,00 € + 29,97 € without VAT. */
async function orderWithItems() {
  const id = await newWorkOrder();
  await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', salePrice: '40', vatRate: '23' }, ctx.db);
  await addItem(admin, id, { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantity: '3', unit: 'ks', purchasePrice: '5', salePrice: '9,99', vatRate: '19' }, ctx.db);
  return id;
}

/** A Zákazka with sixty parts `K-1` to `K-60`, each 1 ks at `i,50` € without VAT 23 %: 1 860,00 € + 428,10 € = 2 288,10 €. */
async function orderWithSixtyItems() {
  const id = await newWorkOrder();
  for (let i = 1; i <= 60; i++) await addItem(admin, id, { kind: 'part', code: `K-${i}`, name: `Položka ${i}x`, quantity: '1', salePrice: `${i},50`, vatRate: '23' }, ctx.db);
  return id;
}

/**
 * The Zákazka when the customer takes the vehicle over: Hotová, the status the odovzdávací protokol is printed in (the cenová
 * ponuka is printed in any). It comes after the items, which change only while a Zákazka is Rozpracovaná.
 */
const handedOver = async (id: string) => {
  await changeWorkOrderStatus(admin, id, { to: 'done' }, ctx.db);
  return id;
};

const forms = [
  // `rowStart` is how the first line of a row of an item reads in the text of the PDF: the code of the item is in it.
  // `ready` brings a Zákazka with its items to the status the form is printed in.
  { name: 'cenová ponuka', respond: quoteResponse, file: 'cenova-ponuka', title: 'Cenová ponuka', rowStart: /^K-\d+(?: |$)/, ready: async (id: string) => id },
  { name: 'odovzdávací protokol', respond: handoverProtocolResponse, file: 'odovzdavaci-protokol', title: 'Odovzdávací protokol', rowStart: /^DielK-/, ready: handedOver },
] as const;
type Respond = (typeof forms)[number]['respond'];

const now = new Date('2026-10-28T09:00:00Z');
const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const pagesOf = async (respond: Respond, id: string, at = now) => readPdf(await bytesOf(await respond(admin, id, ctx.db, at)));
const linesOf = (page: PdfPage) => page.text.split('\n');
const lastPage = (pages: PdfPage[]) => pages.at(-1)!;

// What every form shares is printed and checked once, on the zákazkový list (job-sheet-response.test.ts): the A4 page, the
// cache headers of the answer, the lines of the header and the footer, the letters and the day of the print. Here is what
// differs from form to form: its file, its title, its table and who may have it.
describe.each(forms)('the $name', ({ respond, file, title, rowStart, ready }) => {
  test('is downloaded by the admin as a PDF named by the number of the Zákazka and the form, under its title', async () => {
    const response = await respond(admin, await ready(await orderWithItems()), ctx.db, now);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="Z2026-0001-${file}.pdf"`);
    const [page] = readPdf(await bytesOf(response));
    expect(page!.text).toContain(title);
    expect(page!.text).toContain('Z2026-0001');
  });

  test('prints a name that is longer than its column on several lines, every character of it', async () => {
    const id = await newWorkOrder();
    await addItem(admin, id, { kind: 'part', code: 'DLHY', name: 'Q'.repeat(150), quantity: '1', salePrice: '1' }, ctx.db);

    const [page] = await pagesOf(respond, await ready(id));

    const lines = linesOf(page!);
    expect(lines.filter((line) => line.includes('Q'))).not.toHaveLength(1);
    expect(lines.every((line) => !line.includes('Q'.repeat(150)))).toBe(true);
    expect(page!.text.match(/Q/g)).toHaveLength(150);
  });

  test('breaks its list of items between rows: no page starts with the rest of a row of the page before, and no character of a long name is lost', async () => {
    const id = await newWorkOrder();
    const lengths = Array.from({ length: 30 }, (_, i) => 60 + (i % 5) * 10); // a name of three to six lines each, so that a page cannot end exactly between two rows
    for (const [i, length] of lengths.entries()) await addItem(admin, id, { kind: 'part', code: `K-${i + 1}`, name: 'Q'.repeat(length), quantity: '1', salePrice: '1' }, ctx.db);

    const pages = await pagesOf(respond, await ready(id));

    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages.slice(1)) {
      const first = linesOf(page).find((line) => rowStart.test(line) || line.includes('Q')); // none on a page of the sums or the signatures alone
      if (first !== undefined) expect(first, 'the first line of an item on the page is the start of a row').toMatch(rowStart);
    }
    expect(pages.map((page) => page.text.match(/Q/g)?.length ?? 0).reduce((sum, count) => sum + count, 0)).toBe(lengths.reduce((sum, length) => sum + length, 0));
  });

  test('is the PDF of one Zákazka and of no other', async () => {
    const first = await newWorkOrder();
    const second = await newWorkOrder();
    await addItem(admin, first, { kind: 'labour', name: 'Práca prvej', quantity: '1', salePrice: '1' }, ctx.db);
    await addItem(admin, second, { kind: 'labour', name: 'Práca druhej', quantity: '1', salePrice: '1' }, ctx.db);

    const [page] = await pagesOf(respond, await ready(second));

    expect(page!.text).toContain('Z2026-0002');
    expect(page!.text).toContain('Práca druhej');
    expect(page!.text).not.toContain('Práca prvej');
  });

  test('is a 401 that says so for nobody signed in, and a 403 for the mechanik, who gets no PDF and no detail of the Zákazka', async () => {
    const id = await ready(await orderWithItems());

    const unsigned = await respond(null, id, ctx.db, now);
    const forbidden = await respond(mechanic, id, ctx.db, now);

    expect(unsigned.status).toBe(401);
    expect(unsigned.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(await unsigned.json()).toEqual({ error: 'Nie ste prihlásený.' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(await forbidden.json()).toEqual({ error: forbiddenMessage });
  });

  test('is refused to the mechanik with a 403 also for an id that is no Zákazka, so that he cannot tell which exist', async () => {
    expect((await respond(mechanic, randomUUID(), ctx.db, now)).status).toBe(403);
  });

  test('is a 404 for an id that is no Zákazka, a malformed one included', async () => {
    for (const id of [randomUUID(), 'not-an-id']) {
      const response = await respond(admin, id, ctx.db, now);

      expect(response.status, id).toBe(404);
      expect(response.headers.get('Content-Type'), id).toMatch(/^application\/json/);
      expect(await response.json(), id).toEqual({ error: 'Zákazka neexistuje.' });
    }
  });
});

describe('the cenová ponuka', () => {
  test('lists every item with its quantity, price per unit, VAT rate and amounts, then the sums, and nothing of the purchase', async () => {
    const [page] = await pagesOf(quoteResponse, await orderWithItems());

    const lines = linesOf(page!);
    expect(lines).toEqual(
      expect.arrayContaining([
        'NázovMnožstvoCena za jednotku bez DPHSadzba DPHSuma bez DPHSuma s DPH',
        'Výmena oleja1,5 h40,00 €23 %60,00 €73,80 €',
        'OF-1 Olejový filter3 ks9,99 €19 %29,97 €35,66 €',
        'Spolu bez DPH89,97 €',
        'DPH19,49 €',
        'Spolu s DPH109,46 €',
      ]),
    );
    expect(page!.text).not.toMatch(/nákup|marž|prirážk|poznámk|Podpis|kilometre/i); // the 5,00 € the part was bought for is on no form
    expect(page!.text).not.toContain('5,00 €');
  });

  test('has the sums of the domain: each item rounded to cents once, and the sums of those', async () => {
    const id = await newWorkOrder();
    for (const name of ['Podložka', 'Matica']) await addItem(admin, id, { kind: 'part', name, quantity: '1', salePrice: '0,10', vatRate: '5' }, ctx.db);

    const [page] = await pagesOf(quoteResponse, id);

    expect(linesOf(page!)).toEqual(expect.arrayContaining(['Spolu bez DPH0,20 €', 'DPH0,02 €', 'Spolu s DPH0,22 €'])); // 0,01 € of VAT on each, not 0,01 € on both
    expect(page!.missingGlyphs).toBe(0); // the € sign is in the font: the zákazkový list has no amount to check it on
  });

  test('says so for a Zákazka without items, with sums of nothing', async () => {
    const [page] = await pagesOf(quoteResponse, await newWorkOrder());

    expect(page!.text).toContain('Zákazka zatiaľ nemá žiadne položky.');
    expect(linesOf(page!)).toContain('Spolu s DPH0,00 €');
  });

  test('with sixty items continues on the next pages: the head of the table on each, no row cut, every item once, the sums on the last page, Strana X/Y on each', async () => {
    const pages = await pagesOf(quoteResponse, await orderWithSixtyItems());

    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, index) => expect(linesOf(page).at(-1)).toBe(`Strana ${index + 1}/${pages.length}`));
    for (const page of pages) expect(linesOf(page), 'the head of the table').toContain('NázovMnožstvoCena za jednotku bez DPHSadzba DPHSuma bez DPHSuma s DPH');
    const rows = pages.flatMap(linesOf).filter((line) => /^K-\d+ /.test(line));
    expect(rows).toHaveLength(60);
    for (let i = 1; i <= 60; i++) {
      const found = rows.filter((row) => row.startsWith(`K-${i} Položka ${i}x1 ks${i},50 €23 %${i},50 €`));
      expect(found, `K-${i}`).toHaveLength(1);
      expect(found[0], `K-${i} is whole`).toMatch(/ €$/); // its amount with VAT is on the line of its name: the row was not cut between two pages
    }
    for (const page of pages.slice(0, -1)) expect(page.text).not.toContain('Spolu');
    expect(linesOf(lastPage(pages))).toEqual(expect.arrayContaining(['Spolu bez DPH1 860,00 €', 'DPH428,10 €', 'Spolu s DPH2 288,10 €']));
  });
});

describe('the odovzdávací protokol', () => {
  test('lists the work and the parts with their quantities and units, the kilometres and the day of the handover, and two signature lines, and no price', async () => {
    const [page] = await pagesOf(handoverProtocolResponse, await handedOver(await orderWithItems()));

    const lines = linesOf(page!);
    expect(lines).toEqual(
      expect.arrayContaining([
        'DruhKódNázovMnožstvo',
        'PrácaVýmena oleja1,5 h',
        'DielOF-1Olejový filter3 ks',
        'Kilometre pri príjme123 456 km',
        'Dátum odovzdania28. 10. 2026',
        'Podpis zákazníkaPodpis autoservisu',
      ]),
    );
    expect(page!.text).not.toMatch(/€|DPH|cena|suma|Spolu|nákup|marž|poznámk/i);
  });

  // Kilometre pri odovzdaní (GLOSSARY, #164): the admin enters them on the Zákazka; the protocol prints them next to the kilometres at intake.
  test('prints the kilometres at handover next to the kilometres at intake when the admin entered them', async () => {
    const id = await handedOver(await orderWithItems());
    await setHandoverMileage(admin, id, '123 600', ctx.db);

    const [page] = await pagesOf(handoverProtocolResponse, id);

    const lines = linesOf(page!);
    expect(lines).toEqual(expect.arrayContaining(['Kilometre pri príjme123 456 km', 'Kilometre pri odovzdaní123 600 km', 'Dátum odovzdania28. 10. 2026']));
    expect(lines.indexOf('Kilometre pri príjme123 456 km')).toBeLessThan(lines.indexOf('Kilometre pri odovzdaní123 600 km'));
    expect(page!.text).not.toContain('_');
  });

  test('prints a blank to write the kilometres at handover on, ________ km, when the admin entered none', async () => {
    const [page] = await pagesOf(handoverProtocolResponse, await handedOver(await orderWithItems()));

    expect(linesOf(page!)).toEqual(expect.arrayContaining(['Kilometre pri príjme123 456 km', 'Kilometre pri odovzdaní________ km']));
  });

  test('has the day of the handover that is the day of the print, also when it is not the day of the intake', async () => {
    const [page] = await pagesOf(handoverProtocolResponse, await handedOver(await orderWithItems()), new Date('2026-12-24T11:00:00Z'));

    expect(linesOf(page!)).toContain('Dátum odovzdania24. 12. 2026');
  });

  test('says so for a Zákazka without work or parts, and still has its signatures', async () => {
    const [page] = await pagesOf(handoverProtocolResponse, await handedOver(await newWorkOrder()));

    expect(page!.text).toContain('Zákazka nemá žiadne práce ani diely.');
    expect(linesOf(page!)).toContain('Podpis zákazníkaPodpis autoservisu');
  });

  test('with sixty items continues on the next pages: the head of the table on each, no row cut, every item once, the signatures on the last page, Strana X/Y on each', async () => {
    const pages = await pagesOf(handoverProtocolResponse, await handedOver(await orderWithSixtyItems()));

    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, index) => expect(linesOf(page).at(-1)).toBe(`Strana ${index + 1}/${pages.length}`));
    for (const page of pages) expect(linesOf(page), 'the head of the table').toContain('DruhKódNázovMnožstvo');
    const rows = pages.flatMap(linesOf).filter((line) => /^DielK-\d+/.test(line));
    expect(rows).toHaveLength(60);
    for (let i = 1; i <= 60; i++) expect(rows.filter((row) => row === `DielK-${i}Položka ${i}x1 ks`), `K-${i}`).toHaveLength(1);
    for (const page of pages.slice(0, -1)) expect(page.text).not.toContain('Podpis');
    expect(linesOf(lastPage(pages))).toContain('Podpis zákazníkaPodpis autoservisu');
  });

  // The customer takes the vehicle over when the work is done (Kazarr, #139). Which statuses print is checked in test/handover-protocol.test.ts.
  test('is refused with a 409 and a message, and no PDF is printed, for a Zákazka that is not Hotová or Vyfakturovaná yet', async () => {
    const response = await handoverProtocolResponse(admin, await orderWithItems(), ctx.db, now);

    expect(response.status).toBe(409);
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ error: 'Odovzdávací protokol sa tlačí len pre zákazku v stave Hotová alebo Vyfakturovaná.' });
  });
});
