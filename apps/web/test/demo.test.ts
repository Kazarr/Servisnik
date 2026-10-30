import { rowMark } from '@servisnik/domain/work-order';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { getEdition, listRegistrations, saveEdition, setRegistrationStatus } from '../src/dal/joy-ride.ts';
import { getLogo, saveLogo } from '../src/dal/logo.ts';
import { getWorkshopDetails, saveWorkshopDetails } from '../src/dal/workshop.ts';
import { listWorkOrders } from '../src/dal/work-orders.ts';
import { customer, joyRideEdition, vehicle, workOrder, workOrderItem } from '../src/db/schema.ts';
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

test('the details of the autoservis are the ones of the register, and the phone, which the public repository does not hold, is left to the admin and said so', async () => {
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

// The Termíny of the demo are days from the day of the run, so that "Po termíne" shows one Zákazka late and the rest still ahead. A run
// the day before the demo that left the Termíny of the Zákazky it made on an earlier day would show them all late.

/** The Termín of every demo Zákazka by the VIN of its vehicle. */
const deadlinesByVin = async () =>
  Object.fromEntries((await ctx.db.select({ vin: vehicle.vin, deadline: workOrder.deadline }).from(workOrder).innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id))).map(({ vin, deadline }) => [vin, deadline]));

const termsFromNow = {
  WP0ZZZ99ZPS900101: '2026-11-05', // the 911 GT3, in 2 days
  WUAZZZF2ZMN900102: '2026-11-08', // the RS6, in 5 days
  WBSZZZ8Z0PC900103: '2026-11-02', // the M3, done a day after its Termín
  ZHWZZZ4ZXLL900104: '2026-11-10', // the Huracán, in 7 days
  W1KZZZ8Z0NA900105: '2026-11-01', // the AMG GT, 2 days over
  WP0ZZZY1ZPS900106: null, // the Taycan has none
  WUAZZZ4SZKN900107: '2026-11-04', // the R8, in a day
  WBSZZZ8Z0MC900108: null, // the M5 has none
};

test('the Termín of a new Zákazka is days from the day of the run, and the ones that have none stay without', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  expect(await deadlinesByVin()).toEqual(termsFromNow);
});

test('a later run sets the Termín of the Zákazky that are there already from its own day, and the one that was late is late again', async () => {
  await seedDemo(ctx.db, { logo: png, now });
  const morningOfTheDemo = new Date('2026-11-06T06:00:00Z');

  const result = await seedDemo(ctx.db, { logo: png, now: morningOfTheDemo });

  expect(result.created).toBe(0);
  expect(await deadlinesByVin()).toEqual({
    WP0ZZZ99ZPS900101: '2026-11-08',
    WUAZZZF2ZMN900102: '2026-11-11',
    WBSZZZ8Z0PC900103: '2026-11-05',
    ZHWZZZ4ZXLL900104: '2026-11-13',
    W1KZZZ8Z0NA900105: '2026-11-04',
    WP0ZZZY1ZPS900106: null,
    WUAZZZ4SZKN900107: '2026-11-07',
    WBSZZZ8Z0MC900108: null,
  });
  const { orders } = await listWorkOrders(admin, { status: 'all' }, ctx.db);
  const marks = orders.map(({ status, deadline }) => rowMark(status, deadline, morningOfTheDemo));
  expect(marks.filter((mark) => mark === 'late')).toHaveLength(1);
});

test('a Termín that the admin changed or cleared in the demo is the one of the demo again after the next run', async () => {
  await seedDemo(ctx.db, { logo: png, now });
  await ctx.db.update(workOrder).set({ deadline: '2030-01-01' }).where(eq(workOrder.status, 'inProgress'));
  await ctx.db.update(workOrder).set({ deadline: null }).where(eq(workOrder.status, 'received'));

  await seedDemo(ctx.db, { logo: png, now });

  expect(await deadlinesByVin()).toEqual(termsFromNow);
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

// The Jazda radosti of the demo (ticket #153): the Ročník 2026 and about 8 Registrácie. The repository is public, so every person, e-mail and phone is made up.

const registrations = async () => (await listRegistrations(admin, {}, ctx.db)).registrations;

test('the demo has the Ročník 2026: 10. 10. 2026 in Považská Bystrica, centrum, with the uzávierka the day before at 15:00', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  expect(await getEdition(admin, ctx.db)).toMatchObject({ name: 'Jazda radosti 2026', date: '2026-10-10', place: 'Považská Bystrica, centrum', registrationDeadline: '2026-10-09T15:00' });
});

test('the demo has 8 Registrácie in every Kategória and in every Stav, before the day of the Ročník', async () => {
  const result = await seedDemo(ctx.db, { logo: png, now });

  const { counts: byStatus, registrations: all } = await listRegistrations(admin, {}, ctx.db);
  expect(all).toHaveLength(8);
  expect(result).toMatchObject({ registrationsCreated: 8, registrationsExisting: 0 });
  expect(byStatus).toEqual({ new: 3, approved: 4, rejected: 1 });
  expect(new Set(all.map(({ category }) => category))).toEqual(new Set(['supersport', 'interesting', 'heavy', 'veteran', 'motorcycle', 'other']));
  expect(new Set(all.map(({ createdOn }) => createdOn)).size).toBeGreaterThan(1); // not all on the day of the run
  expect(all.every(({ createdOn }) => createdOn <= '2026-10-09')).toBe(true);
});

test('every exhibitor, e-mail and phone is made up: an e-mail at example.com and a phone that cannot be real', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  const exhibitors = await registrations();
  expect(exhibitors).toHaveLength(8); // not a loop over nothing
  for (const { email, phone } of exhibitors) {
    expect(email, email).toMatch(/^[a-z0-9.-]+@example\.com$/);
    expect(phone, phone).toMatch(/^\+421 000 000 \d{3}$/); // after +421 no Slovak number begins with 0
  }
});

test('a second run makes no Registrácia and no Ročník again, and says what was there', async () => {
  await seedDemo(ctx.db, { logo: png, now });

  const second = await seedDemo(ctx.db, { logo: png, now });

  expect(await registrations()).toHaveLength(8);
  expect(await ctx.db.$count(joyRideEdition)).toBe(1);
  expect(second).toMatchObject({ registrationsCreated: 0, registrationsExisting: 8 });
});

test('what the admin did in the Jazda radosti is left by the next run: a Registrácia he decided and the Ročník he edited', async () => {
  await seedDemo(ctx.db, { logo: png, now });
  const [aNew] = (await listRegistrations(admin, { status: 'new' }, ctx.db)).registrations;
  await setRegistrationStatus(admin, aNew!.id, 'rejected', ctx.db);
  await saveEdition(admin, { name: 'Jazda radosti 2026 (3. ročník)', date: '2026-10-17', place: 'Pri radnici', registrationDeadline: '2026-10-16T12:00' }, ctx.db);

  await seedDemo(ctx.db, { logo: png, now });

  expect((await listRegistrations(admin, {}, ctx.db)).counts).toEqual({ new: 2, approved: 4, rejected: 2 });
  expect(await ctx.db.$count(joyRideEdition)).toBe(1);
  expect(await getEdition(admin, ctx.db)).toMatchObject({ name: 'Jazda radosti 2026 (3. ročník)', place: 'Pri radnici' });
});
