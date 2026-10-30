import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { addVehicle, editVehicle, type VehicleFormState } from '../src/app/(app)/vozidla/actions.ts';
import { VehicleForm } from '../src/app/(app)/vozidla/vehicle-form.tsx';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle, getVehicle, searchVehicles } from '../src/dal/vehicles.ts';
import type { Database } from '../src/db/index.ts';
import { answered } from './support/action-state.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { ledTo } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { reasonOf, valueOf } from './support/form-markup.ts';
import { idOf } from './support/id-of.ts';
import { hrefOf } from './support/page-markup.ts';
import { truncateTables } from './support/reset.ts';

// Zákazníci a vozidlá (spec #67), the form of a Vozidlo: what the Server Actions answer when it is sent, and what the form shows of
// the answer. The actions are called as the admin's forms call them, over the real DAL and the database of this file, and the form
// is drawn from the answer they gave. useActionState holds that answer in the browser, and renderToStaticMarkup does not run it, so
// the hook is handed it (support/action-state.ts). Who may send the form is in forbidden.test.ts and
// forms-without-session.test.ts, the pages that open it in vehicle-pages.test.ts.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: (await import('./support/action-state.ts')).useActionState,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Autodoprava Kováč s.r.o.', ico: '12345678' }, ctx.db));
});

const vin = 'WVWZZZ1JZ3W386752';
const another = 'TMBZZZ5JZ3W000002';
/** The year after the current one in Europe/Bratislava, the last year a vehicle may be from. */
const lastYear = () => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric' })) + 1;

/** The form of a new Vozidlo of the Majiteľ, drawn as the browser draws it once an action has answered. */
function drawnNew(state: VehicleFormState) {
  answered.state = state;
  return renderToStaticMarkup(createElement(VehicleForm, { action: addVehicle, ownerId }));
}

/** The form that edits a Vozidlo, drawn the same way. */
function drawnEdit(state: VehicleFormState, id: string) {
  answered.state = state;
  const saved = { id, vin, licensePlate: null, make: 'Škoda', model: 'Fabia', year: null, fuel: null, mileageKm: null, note: null };
  return renderToStaticMarkup(createElement(VehicleForm, { action: editVehicle, vehicle: saved }));
}

const vehicles = async () => (await searchVehicles(admin, {}, ctx.db)).vehicles;

const advice = 'VIN nemá písmená I, O ani Q: namiesto I patrí 1, namiesto O a Q patrí 0';

// The letter Q and the years on both sides of the limits are tried in the domain's unit tests; here every kind of answer is a reason on the field.
test.each([
  ['16 characters', vin.slice(0, 16), 'VIN musí mať presne 17 znakov'],
  ['18 characters', `${vin}1`, 'VIN musí mať presne 17 znakov'],
  ['an I', `${vin.slice(0, 16)}I`, advice],
  ['an O', `${vin.slice(0, 16)}O`, advice],
  ['a Q', `${vin.slice(0, 16)}Q`, advice],
  ['a character that is no letter or digit', `${vin.slice(0, 16)}!`, 'VIN smie obsahovať len písmená A–Z a číslice 0–9'],
])('a VIN of %s is refused at the VIN field, with the reason and what was typed, and nothing is saved', async (_what, typed, reason) => {
  const state = await addVehicle(null, form({ ownerId, vin: typed, make: 'Volkswagen', model: 'Golf' }));

  const html = drawnNew(state);

  expect(reasonOf(html, 'vin')).toBe(reason);
  expect(valueOf(html, 'vin')).toBe(typed);
  expect(valueOf(html, 'make')).toBe('Volkswagen');
  expect(await vehicles()).toEqual([]);
});

test('a year and kilometres out of range are refused at their own fields, with the limits, and what was typed stays', async () => {
  const state = await addVehicle(null, form({ ownerId, vin, make: 'Volkswagen', model: 'Golf', year: '1949', mileageKm: '-5' }));

  const html = drawnNew(state);

  expect(reasonOf(html, 'year')).toBe(`Rok výroby má byť od 1950 do ${lastYear()}`);
  // The app groups the digits with a no-break space, which \s matches.
  expect(reasonOf(html, 'mileageKm')).toMatch(/^Stav km má byť celé číslo od 0 do 9\s999\s999$/);
  expect(valueOf(html, 'year')).toBe('1949');
  expect(valueOf(html, 'mileageKm')).toBe('-5');
  expect(reasonOf(html, 'vin')).toBeNull();
  expect(await vehicles()).toEqual([]);
});

test('with every reason fixed the vehicle is saved once, with 0 km, which is a stav km too, and the form leads to its owner', async () => {
  expect(await ledTo(addVehicle(null, form({ ownerId, vin, make: 'Volkswagen', model: 'Golf', year: String(lastYear()), mileageKm: '0' })), 'zakaznici')).toBe(ownerId);

  expect(await vehicles()).toHaveLength(1);
  expect(await getVehicle(admin, (await vehicles())[0]!.id, ctx.db)).toMatchObject({ vin, year: lastYear(), mileageKm: 0, owner: { id: ownerId } });
});

test('a vehicle typed the way it is read off a document is saved with the VIN and ŠPZ normalised, and every detail it had', async () => {
  const typed = { ownerId, vin: 'wvw zzz1jz-3w386752', licensePlate: 'ba-123 ab', make: 'Volkswagen', model: 'Golf', year: '2015', fuel: 'diesel', mileageKm: '123 456', note: 'Nová spojka' };

  await ledTo(addVehicle(null, form(typed)), 'zakaznici');

  expect(await getVehicle(admin, (await vehicles())[0]!.id, ctx.db)).toMatchObject({
    vin,
    licensePlate: 'BA123AB',
    make: 'Volkswagen',
    model: 'Golf',
    year: 2015,
    fuel: 'diesel',
    mileageKm: 123456,
    note: 'Nová spojka',
    owner: { id: ownerId, name: 'Autodoprava Kováč s.r.o.' },
  });
});

test('a second vehicle with a VIN that is taken is refused however the VIN is typed: its field names the first, its owner, and leads to both', async () => {
  const first = idOf(await createVehicle(admin, { ownerId, vin, licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));

  const html = drawnNew(await addVehicle(null, form({ ownerId, vin: vin.toLowerCase(), make: 'Škoda', model: 'Octavia' })));

  expect(reasonOf(html, 'vin')).toBe('Vozidlo s týmto VIN už existuje: Volkswagen Golf, majiteľ Autodoprava Kováč s.r.o.');
  expect(hrefOf(html, 'Volkswagen Golf')).toBe(`/vozidla/${first}`);
  expect(hrefOf(html, 'Autodoprava Kováč s.r.o.')).toBe(`/zakaznici/${ownerId}`);
  expect(valueOf(html, 'vin')).toBe(vin.toLowerCase());
  expect((await vehicles()).map(({ id }) => id)).toEqual([first]);
});

/** The form of the edit of a Vozidlo with every field filled, as the admin typed them, so that what a refused save keeps can be told from what it lost. */
const everyField = { licensePlate: 'ba-123 ab', make: 'Volkswagen', model: 'Golf', year: '2015', fuel: 'diesel', mileageKm: '123 456', note: 'Nová spojka' };

test("an edit to the VIN of another vehicle is refused at the VIN field, which names that vehicle and its owner, and everything else the form had stays", async () => {
  const taken = idOf(await createVehicle(admin, { ownerId, vin: another, licensePlate: '', make: 'Škoda', model: 'Octavia' }, ctx.db));
  const id = idOf(await createVehicle(admin, { ownerId, vin, licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));

  const html = drawnEdit(await editVehicle(null, form({ id, vin: another, ...everyField })), id);

  expect(reasonOf(html, 'vin')).toBe('Vozidlo s týmto VIN už existuje: Škoda Octavia, majiteľ Autodoprava Kováč s.r.o.');
  expect(hrefOf(html, 'Škoda Octavia')).toBe(`/vozidla/${taken}`);
  expect(hrefOf(html, 'Autodoprava Kováč s.r.o.')).toBe(`/zakaznici/${ownerId}`);
  expect(['vin', 'licensePlate', 'make', 'model', 'year', 'mileageKm'].map((name) => [name, valueOf(html, name)])).toEqual([
    ['vin', another],
    ['licensePlate', 'ba-123 ab'],
    ['make', 'Volkswagen'],
    ['model', 'Golf'],
    ['year', '2015'],
    ['mileageKm', '123 456'],
  ]);
  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({ vin });
});

test('a typo in the VIN is corrected: the same vehicle, with the same owner and everything it had, under the VIN it should have', async () => {
  const typo = 'WVWZZZ1JZ3X386752';
  const id = idOf(await createVehicle(admin, { ownerId, vin: typo, ...everyField }, ctx.db));
  const before = await getVehicle(admin, id, ctx.db);

  expect(await ledTo(editVehicle(null, form({ id, vin, ...everyField })), 'vozidla')).toBe(id);

  expect(await getVehicle(admin, id, ctx.db)).toEqual({ ...before, vin });
  expect((await searchVehicles(admin, { query: typo }, ctx.db)).total).toBe(0);
  expect(await vehicles()).toHaveLength(1);
});
