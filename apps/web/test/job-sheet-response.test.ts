import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { removeLogo, saveLogo } from '../src/dal/logo.ts';
import type { User } from '../src/dal/user.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { saveWorkshopDetails } from '../src/dal/workshop.ts';
import { createWorkOrder } from '../src/dal/work-orders.ts';
import { jobSheetResponse } from '../src/job-sheet-response.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { watchChromium } from './support/chromium.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { png } from './support/logo-files.ts';
import { fontsOf, readPdf } from './support/pdf.ts';

// The Route Handler of the zákazkový list (spec #95, Tlačivá; ticket #100): a signed-in user gets the PDF of a
// Zákazka as a download. The route file only finds the user in the session; the answers are here, printed by the
// real Chromium (`pnpm e2e:install`).

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
  await ctx.db.execute(sql`truncate customer, work_order_counter cascade`);
  await removeLogo(admin, ctx.db);
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ľubomír Škrabák' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Škoda', model: 'Octavia' }, ctx.db));
});

const newWorkOrder = async (customerRequest = 'Výmena oleja\nKontrola bŕzd', mileageKm = '123 456') =>
  idOf(await createWorkOrder(admin, { vehicleId, mileageKm, customerRequest }, ctx.db, new Date('2026-07-15T10:00:00Z')));

const get = (user: User | null, id: string, now = new Date('2026-10-28T09:00:00Z')) => jobSheetResponse(user, id, ctx.db, now);
const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());

test.each([
  ['the admin', admin],
  ['the mechanik', mechanic],
])('%s downloads the zákazkový list as a PDF named by the number of the Zákazka, on one A4 page', async (_who, user) => {
  const id = await newWorkOrder();

  const response = await get(user, id);

  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="Z2026-0001-zakazkovy-list.pdf"');
  const pdf = await bytesOf(response);
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  const pages = readPdf(pdf);
  expect(pages).toHaveLength(1);
  expect(pages[0]!.width).toBeGreaterThan(595); // 595 × 842 points, A4; Chromium makes the page 595.92 × 842.88
  expect(pages[0]!.width).toBeLessThan(597);
  expect(pages[0]!.height).toBeGreaterThan(842);
  expect(pages[0]!.height).toBeLessThan(844);
});

test('the PDF is for the one who asked: no shared cache keeps it, and a browser takes it for nothing but a PDF', async () => {
  const response = await get(mechanic, await newWorkOrder());

  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
});

test('the PDF says what is on the form: the autoservis, the number, the day of the print, the customer, the vehicle, the kilometres, the request and Strana 1/1, and no amount', async () => {
  const [page] = readPdf(await bytesOf(await get(admin, await newWorkOrder())));

  const text = page!.text;
  for (const line of [
    'Autoservis Žilinský',
    'Hlavná 1, 81101 Bratislava', // the PSČ as the app keeps it: five digits, no space
    'IČO: 12345678',
    'Zákazkový list',
    'Z2026-0001',
    '28. 10. 2026',
    'Ľubomír Škrabák',
    'Škoda Octavia',
    'WVWZZZ1JZ3W386752',
    'BA123AB',
    '123 456 km',
    'Podpis zákazníka',
  ])
    expect(text, line).toContain(line);
  expect(text.split('\n')).toEqual(expect.arrayContaining(['Výmena oleja', 'Kontrola bŕzd'])); // the lines of the request stay lines
  expect(text.split('\n').at(-1)).toBe('Strana 1/1');
  expect(text).not.toContain('€');
});

test('the PDF carries the Termín of the Zákazka and not its internal note', async () => {
  const id = idOf(
    await createWorkOrder(admin, { vehicleId, mileageKm: '1', customerRequest: 'Brzdy', deadline: '2026-12-01', note: 'Interná poznámka dielne' }, ctx.db),
  );

  const [page] = readPdf(await bytesOf(await get(admin, id)));

  expect(page!.text).toMatch(/Termín\s*1\. 12\. 2026/);
  expect(page!.text).not.toContain('Interná poznámka dielne');
});

test('the day of the print is the day in Europe/Bratislava, which late in the evening UTC is already the next one', async () => {
  const [page] = readPdf(await bytesOf(await get(admin, await newWorkOrder(), new Date('2026-10-27T23:30:00Z'))));

  expect(page!.text).toContain('28. 10. 2026');
  expect(page!.text).not.toContain('27. 10. 2026');
});

test('Slovak letters in the data print as letters, none of them as a missing glyph', async () => {
  const letters = 'ľščťžýáíéóúäôňĺŕďĽŠČŤŽÝÁÍÉÓÚÄÔŇĹŔĎ';

  const [page] = readPdf(await bytesOf(await get(admin, await newWorkOrder(`Pokazená ${letters}`))));

  expect(page!.text).toContain(`Pokazená ${letters}`);
  expect(page!.text).toContain('Ľubomír Škrabák');
  expect(page!.missingGlyphs).toBe(0);
});

// The font of the system is whatever the machine has: in the image Chromium took a Chinese font for it. The form names
// Arial, which a machine without it answers with Liberation Sans (the image ships it, and so does the runner of CI).
test('the form prints every letter in Arial or Liberation Sans, and in no other font', async () => {
  const pdf = await bytesOf(await get(admin, await newWorkOrder('Žltá ľavá ťažká ôsma')));

  const fonts = fontsOf(pdf);

  expect(fonts.length).toBeGreaterThan(0);
  for (const font of fonts) expect(font, font).toMatch(/^(Arial|LiberationSans)/);
});

test('a long request continues on the next page, every line of it printed, with the number of the page in the footer', async () => {
  const lines = Array.from({ length: 120 }, (_, index) => `Požiadavka ${index + 1}`);

  const pages = readPdf(await bytesOf(await get(admin, await newWorkOrder(lines.join('\n')))));

  expect(pages.length).toBeGreaterThan(1);
  pages.forEach((page, index) => expect(page.text.split('\n').at(-1)).toBe(`Strana ${index + 1}/${pages.length}`));
  const text = pages.map((page) => page.text).join('\n');
  for (const line of lines) expect(text.split('\n')).toContain(line);
});

test('the logo of the autoservis is on the form when there is one, and there is no image when there is none', async () => {
  const id = await newWorkOrder();
  const withoutLogo = Buffer.from(await bytesOf(await get(admin, id))).toString('latin1');
  await saveLogo(admin, png, ctx.db);
  const withLogo = Buffer.from(await bytesOf(await get(admin, id))).toString('latin1');

  expect(withoutLogo).not.toContain('/Subtype /Image');
  expect(withLogo).toContain('/Subtype /Image');
});

test('nobody signed in gets no PDF, but a 401 that says so', async () => {
  const response = await get(null, await newWorkOrder());

  expect(response.status).toBe(401);
  expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
  expect(await response.json()).toEqual({ error: 'Nie ste prihlásený.' });
});

test('an id that is no Zákazka, a malformed one included, is a 404 with no PDF', async () => {
  for (const id of [randomUUID(), 'not-an-id']) {
    const response = await get(admin, id);

    expect(response.status, id).toBe(404);
    expect(response.headers.get('Content-Type'), id).toMatch(/^application\/json/);
    expect(await response.json(), id).toEqual({ error: 'Zákazka neexistuje.' });
  }
});
