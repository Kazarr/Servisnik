import { rowMark } from '@servisnik/domain/work-order';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { getLogo, saveLogo } from '../src/dal/logo.ts';
import { getWorkshopDetails, saveWorkshopDetails } from '../src/dal/workshop.ts';
import { listWorkOrders } from '../src/dal/work-orders.ts';
import { customer, vehicle, workOrder, workOrderItem } from '../src/db/schema.ts';
import { demoLogoUrl, downloadLogo, seedDemo } from '../src/demo.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { jpeg, png, textNamedPng } from './support/logo-files.ts';

// The demo environment (ticket #150): the autoservis of the customer the app is shown to, with a few Zákazky on premium and
// sports cars. It is its own script (`pnpm db:demo`), run by hand, never by a deploy or by `db:seed`. The details are the ones of the
// register, as the ticket lists them; every customer, ŠPZ and VIN is made up.

const now = new Date('2026-11-03T09:00:00Z');
let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  ctx = await createTestDb();
});
afterEach(() => ctx.close());

const counts = async () => ({
  customers: await ctx.db.$count(customer),
  vehicles: await ctx.db.$count(vehicle),
  workOrders: await ctx.db.$count(workOrder),
  items: await ctx.db.$count(workOrderItem),
});

test('the details of the autoservis are the ones of the register, and the phone, which is not in it, is left out and said so', async () => {
  const result = await seedDemo(ctx.db, { logo: png, now });

  expect(await getWorkshopDetails(admin, ctx.db)).toEqual({
    name: 'Autocentrum Slovensko s. r. o.',
    street: 'Rozkvet 2055/118',
    city: 'Považská Bystrica',
    postalCode: '01701',
    ico: '54436079',
    dic: '2121662114',
    icDph: 'SK2121662114',
    vatPayerType: 'payer',
    iban: null,
    phone: null,
    email: 'jmautocentrum@jmautocentrum.sk',
    commercialRegister: null,
  });
  expect(result.phoneMissing).toBe(true);
});

test('what the admin typed that the register does not have, the phone, the IBAN and the entry of the register, is still there after the demo runs again', async () => {
  await seedDemo(ctx.db, { logo: png, now });
  await saveWorkshopDetails(
    admin,
    {
      name: 'Premenované',
      street: '',
      city: '',
      postalCode: '',
      ico: '',
      dic: '',
      icDph: 'SK2121662114',
      vatPayerType: 'payer',
      iban: 'SK31 1200 0000 1987 4263 7541',
      phone: '+421 900 123 456',
      email: '',
      commercialRegister: 'Okresný súd Trenčín, oddiel Sro, vložka 1/R',
    },
    ctx.db,
  );

  const result = await seedDemo(ctx.db, { logo: png, now });

  expect(await getWorkshopDetails(admin, ctx.db)).toMatchObject({
    name: 'Autocentrum Slovensko s. r. o.', // the register's, which the demo sets every time
    phone: '+421 900 123 456',
    iban: 'SK3112000000198742637541',
    commercialRegister: 'Okresný súd Trenčín, oddiel Sro, vložka 1/R',
  });
  expect(result.phoneMissing).toBe(false);
});

test('the logo is the file the demo was given, and the demo says it saved it', async () => {
  const result = await seedDemo(ctx.db, { logo: png, now });

  expect(await getLogo(admin, ctx.db)).toEqual({ contentType: 'image/png', bytes: png });
  expect(result.logoSaved).toBe(true);
});

// The logo of the customer is not in the repository, which is public: whether his trademark may be there is his call. `pnpm db:demo`
// downloads it from the address in the ticket when it runs, and when that fails the demo goes on without it.

test('the logo is downloaded from the address of the ticket, and the bytes of the answer are the logo', async () => {
  const asked: string[] = [];

  const logo = await downloadLogo(async (url) => (asked.push(url), new Response(png)));

  expect(logo).toEqual(png);
  expect(asked).toEqual(['https://www.jmautocentrum.sk/wp-content/uploads/2023/04/Untitled-2.jpeg']);
  expect(demoLogoUrl).toBe(asked[0]);
});

test('a download that fails gives no logo: an answer that is not a success, a connection that breaks, a server that does not answer', async () => {
  expect(await downloadLogo(async () => new Response('Not found', { status: 404 }))).toBeNull();
  expect(await downloadLogo(async () => new Response('Maintenance', { status: 503 }))).toBeNull();
  expect(await downloadLogo(async () => Promise.reject(new TypeError('fetch failed')))).toBeNull();
  const silent = (_url: string, { signal }: { signal: AbortSignal }) => new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  expect(await downloadLogo(silent, 20)).toBeNull();
});

test.each([
  ['there is none', null],
  ['it is no image, as the page of a site under maintenance is none', textNamedPng],
])('when %s, the demo makes everything else, says it saved no logo, and leaves the logo that was there', async (_why, logo) => {
  await saveLogo(admin, jpeg, ctx.db);

  const result = await seedDemo(ctx.db, { logo, now });

  expect(result.logoSaved).toBe(false);
  expect(await getLogo(admin, ctx.db)).toEqual({ contentType: 'image/jpeg', bytes: jpeg });
  expect(await getWorkshopDetails(admin, ctx.db)).toMatchObject({ ico: '54436079' });
  expect(await ctx.db.$count(workOrder)).toBe(result.created);
  expect(result.created).toBeGreaterThanOrEqual(6);
});

test('the Zákazky are on premium and sports cars, in every Stav the list shows, with one after its Termín and more to be invoiced', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  const { orders } = await listWorkOrders(admin, { status: 'all' }, ctx.db);

  const makes = new Set(orders.map(({ vehicle: { make } }) => make));
  for (const make of ['Porsche', 'Audi', 'BMW', 'Lamborghini']) expect(makes, make).toContain(make);
  expect(new Set(orders.map(({ status }) => status))).toEqual(new Set(['received', 'inProgress', 'waitingForParts', 'done']));
  const marks = orders.map(({ status, deadline }) => rowMark(status, deadline, now));
  expect(marks.filter((mark) => mark === 'late').length).toBeGreaterThanOrEqual(1);
  expect(marks.filter((mark) => mark === 'toInvoice').length).toBeGreaterThanOrEqual(2);
  expect(marks.filter((mark) => mark === null).length).toBeGreaterThanOrEqual(2); // the rest are plain rows
});

test('every Zákazka has work and parts with prices, so the cenová ponuka and the odovzdávací protokol have something to show', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  const { workOrders, items } = await counts();

  expect(workOrders).toBeGreaterThanOrEqual(6);
  expect(items).toBeGreaterThanOrEqual(workOrders * 2);
});

test('every customer is a person with no IČO, so no company that exists is named, and every vehicle belongs to its own customer', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  const customers = await ctx.db.select({ type: customer.type, ico: customer.ico }).from(customer);
  expect(new Set(customers.map(({ type }) => type))).toEqual(new Set(['person']));
  expect(customers.every(({ ico }) => ico === null)).toBe(true);
  expect(await ctx.db.$count(vehicle)).toBe(customers.length);
});

test('a second run makes nothing new: the same customers, vehicles, Zákazky and items, and it says what was there already', async () => {
  const first = await seedDemo(ctx.db, { logo: png, now });
  const afterFirst = await counts();

  const second = await seedDemo(ctx.db, { logo: png, now });

  expect(await counts()).toEqual(afterFirst);
  expect(first.created).toBe(afterFirst.workOrders);
  expect(first.existing).toBe(0);
  expect(second).toMatchObject({ created: 0, existing: afterFirst.workOrders });
});

test('after the demo data was deleted the next run makes it again', async () => {
  await seedDemo(ctx.db, { logo: png, now });
  const before = await counts();
  await ctx.db.delete(workOrder); // the Zákazky first: a Vozidlo with a Zákazka cannot be deleted, nor a Zákazník with a Vozidlo
  await ctx.db.delete(vehicle);
  await ctx.db.delete(customer);
  expect(await counts()).toEqual({ customers: 0, vehicles: 0, workOrders: 0, items: 0 });

  const again = await seedDemo(ctx.db, { logo: png, now });

  expect(await counts()).toEqual(before);
  expect(again.created).toBe(before.workOrders);
});
