import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { removeLogo, saveLogo } from '../src/dal/logo.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { getLetterhead, saveLetterhead } from '../src/dal/workshop.ts';
import { changeWorkOrderStatus, createWorkOrder } from '../src/dal/work-orders.ts';
import { workshop } from '../src/db/schema.ts';
import { handoverProtocolResponse } from '../src/handover-protocol-response.ts';
import { jobSheetResponse } from '../src/job-sheet-response.ts';
import { quoteResponse } from '../src/quote-response.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { watchChromium } from './support/chromium.ts';
import { appCss, hexesOf, tokensOf } from './support/css-tokens.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { png } from './support/logo-files.ts';
import { paintsWith, readPdf } from './support/pdf.ts';
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
