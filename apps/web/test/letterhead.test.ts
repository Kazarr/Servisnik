import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { removeLogo, saveLogo } from '../src/dal/logo.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { getLetterhead, saveLetterhead, saveWorkshopDetails } from '../src/dal/workshop.ts';
import { changeWorkOrderStatus, createWorkOrder } from '../src/dal/work-orders.ts';
import { workOrderCounter, workshop } from '../src/db/schema.ts';
import { handoverProtocolResponse } from '../src/handover-protocol-response.ts';
import { jobSheetResponse } from '../src/job-sheet-response.ts';
import { printedDocument } from '../src/print/document.ts';
import { html } from '../src/print/html.ts';
import { printPdf } from '../src/print/pdf.ts';
import { quoteResponse } from '../src/quote-response.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { watchChromium } from './support/chromium.ts';
import { appCss, hexesOf, tokensOf } from './support/css-tokens.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { png } from './support/logo-files.ts';
import { paintsWith, readPdf } from './support/pdf.ts';
import { workshop as exampleWorkshop } from './support/print-fixtures.ts';
import { truncateTables } from './support/reset.ts';

// The Hlavička tlačív (GLOSSARY, ticket #150): the top of every printed form is white, or a black bar with a thin gold line under
// it, whichever the admin picked in Nastavenia. The pick is read by everybody who prints and written by the admin; the table of
// dal-access.test.ts proves who may, these tests prove the flows. The PDFs are printed by the real Chromium (`pnpm e2e:install`).

const tokens = tokensOf(appCss);
const theme = { bar: hexesOf(tokens['--color-background']!)[0]!, line: hexesOf(tokens['--color-accent']!)[0]!, text: hexesOf(tokens['--color-text']!)[0]! };

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let vehicleId: string;
const { closeAll } = watchChromium();
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await closeAll();
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.update(workshop).set({ name: 'Autocentrum Slovensko s. r. o.', letterhead: 'white' });
  await truncateTables(ctx.db, 'customer', 'work_order_counter');
  await removeLogo(admin, ctx.db);
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ľubomír Škrabák' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Porsche', model: '911 GT3' }, ctx.db));
});

const newWorkOrder = async () => idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '12 345', customerRequest: 'Výmena oleja' }, ctx.db));
/** The odovzdávací protokol is printed for a Zákazka that is Hotová. */
const handedOver = async (id: string) => {
  await changeWorkOrderStatus(admin, id, { to: 'done' }, ctx.db);
  return id;
};
const firstPage = async (response: Response) => readPdf(new Uint8Array(await response.arrayBuffer()))[0]!;

test('a new database prints with the white Hlavička', async () => {
  expect(await getLetterhead(admin, ctx.db)).toBe('white');
});

test('the Hlavička the admin saves is what everybody reads next, the mechanik too, and a value that is no Hlavička is refused and changes nothing', async () => {
  expect(await saveLetterhead(admin, 'blackBar', ctx.db)).toEqual({ ok: true, letterhead: 'blackBar' });
  expect(await getLetterhead(mechanic, ctx.db)).toBe('blackBar');

  expect(await saveLetterhead(admin, 'Čierny pruh', ctx.db)).toEqual({ ok: false });
  expect(await getLetterhead(admin, ctx.db)).toBe('blackBar');

  expect(await saveLetterhead(admin, 'white', ctx.db)).toEqual({ ok: true, letterhead: 'white' });
  expect(await getLetterhead(admin, ctx.db)).toBe('white');
});

test('the white Hlavička prints no bar and no gold line', async () => {
  const page = await firstPage(await jobSheetResponse(admin, await newWorkOrder(), ctx.db));

  expect(paintsWith(page, theme.bar)).toBe(false);
  expect(paintsWith(page, theme.line)).toBe(false);
  expect(page.text).toContain('Autocentrum Slovensko s. r. o.');
});

test.each([
  ['the zákazkový list, which the mechanik prints too', (id: string) => jobSheetResponse(mechanic, id, ctx.db)],
  ['the cenová ponuka', (id: string) => quoteResponse(admin, id, ctx.db)],
  ['the odovzdávací protokol', async (id: string) => handoverProtocolResponse(admin, await handedOver(id), ctx.db)],
])('with the black bar picked, %s prints the bar in the colour of the theme with white text and a gold line, and the details are still there', async (_form, print) => {
  await saveLetterhead(admin, 'blackBar', ctx.db);
  await saveLogo(admin, png, ctx.db);

  const page = await firstPage(await print(await newWorkOrder()));

  expect(paintsWith(page, theme.bar)).toBe(true);
  expect(paintsWith(page, theme.line)).toBe(true);
  expect(paintsWith(page, theme.text)).toBe(true);
  expect(page.text).toContain('Autocentrum Slovensko s. r. o.');
  expect(page.text).toContain('Číslo zákazky');
});

// The right column of the header and the identifiers of the autoservis (tickets #148, #164): the title of the form, a number, a day and a labelled identifier
// are each printed on one line, however long the details of the autoservis are. The name, the address and the identifiers are the
// demo's; the e-mail, the phone, the IBAN and the entry of the register are made long so that the details column is wide. The
// counter is set so that the number is the long one, `Z2026-123456`.
const printedOn = new Date('2026-10-29T09:00:00Z');
test.each(
  (['white', 'blackBar'] as const).flatMap((letterhead) => [
    [letterhead, 'zákazkový list', 'Zákazkový list', (id: string) => jobSheetResponse(admin, id, ctx.db, printedOn)] as const,
    [letterhead, 'cenová ponuka', 'Cenová ponuka', (id: string) => quoteResponse(admin, id, ctx.db, printedOn)] as const,
    [letterhead, 'odovzdávací protokol', 'Odovzdávací protokol', async (id: string) => handoverProtocolResponse(admin, await handedOver(id), ctx.db, printedOn)] as const,
  ]),
)('on the %s Hlavička the %s keeps its title, the number of the Zákazka, the day of the print and the IČ DPH each on one line', async (letterhead, _form, title, print) => {
  await saveWorkshopDetails(
    admin,
    {
      name: 'Autocentrum Slovensko s. r. o.',
      street: 'Rozkvet 2055/118',
      city: 'Považská Bystrica',
      postalCode: '017 01',
      ico: '54436079',
      dic: '2121662114',
      icDph: 'SK2121662114',
      vatPayerType: 'payer',
      iban: 'SK3112000000198742637541',
      phone: '+421 900 123 456',
      email: 'autocentrum.slovensko.servis@jmautocentrum.sk',
      commercialRegister: 'Obchodný register Okresného súdu Trenčín, oddiel: Sro, vložka č.: 12345/R',
    },
    ctx.db,
  );
  await saveLetterhead(admin, letterhead, ctx.db);
  await saveLogo(admin, png, ctx.db);
  await ctx.db.insert(workOrderCounter).values({ year: 2026, lastSequence: 123_455 });
  const id = idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '12 345', customerRequest: 'Výmena oleja' }, ctx.db, new Date('2026-07-15T10:00:00Z')));

  const lines = (await firstPage(await print(id))).text.split('\n');

  const broken = [title, 'Z2026-123456', '29. 10. 2026', 'IČ DPH: SK2121662114'].filter((whole) => !lines.some((line) => line.includes(whole)));
  expect(broken, `broken across lines in ${JSON.stringify(lines.slice(0, 14))}`).toEqual([]);
});

// The title of a form is never broken (ticket #164). The column of the title has the width of the title (`.identity { flex: none }`, ticket #148), and the
// title does not rely on that: here the column may shrink, as the long details of the autoservis ask it to, and the title is still one line. The longest title is
// the one that breaks here; the other two are shorter and stay whole in this column even without the rule, so they could not fail.
test('the title of the odovzdávací protokol stays on one line in a column that may shrink', async () => {
  const header = { number: 'Z2026-0001', customer: { name: 'Ján Novák' }, vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Porsche', model: '911 GT3' } };
  const longDetails = { ...exampleWorkshop, email: 'autocentrum.slovensko.servis@jmautocentrum.sk', commercialRegister: 'Obchodný register Okresného súdu Trenčín, oddiel: Sro, vložka č.: 12345/R' };
  const document = printedDocument({ ...header, title: 'Odovzdávací protokol', printedOn: '2026-10-29', workshop: longDetails, logo: null, letterhead: 'white' }, html``);
  const shrinking = document.replace('</style>', '.identity { flex: 0 1 auto; }</style>');
  expect(shrinking).not.toBe(document);

  const lines = readPdf(await printPdf(shrinking))[0]!.text.split('\n');

  expect(lines.filter((line) => line.includes('Odovzdávací protokol')), `broken across lines in ${JSON.stringify(lines.slice(0, 14))}`).toEqual(['Odovzdávací protokol']);
});
