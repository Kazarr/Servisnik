import type { CustomerType } from '@servisnik/domain/customer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { addCustomer, editCustomer, type CustomerFormState } from '../src/app/(app)/zakaznici/actions.ts';
import { CustomerForm } from '../src/app/(app)/zakaznici/customer-form.tsx';
import { createCustomer, getCustomer, listCustomers } from '../src/dal/customers.ts';
import type { Database } from '../src/db/index.ts';
import { answered } from './support/action-state.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { ledTo } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { input, reasonOf, valueOf } from './support/form-markup.ts';
import { idOf } from './support/id-of.ts';
import { hrefOf } from './support/page-markup.ts';
import { truncateTables } from './support/reset.ts';

// Zákazníci a vozidlá (spec #67), the form of a Zákazník: what the Server Actions answer when it is sent, and what the form shows of
// the answer. The actions are called as the admin's forms call them, over the real DAL and the database of this file, and the form
// is drawn from the answer they gave. useActionState holds that answer in the browser, and renderToStaticMarkup does not run it, so
// the hook is handed it (support/action-state.ts). Who may send the form is in forbidden.test.ts and
// forms-without-session.test.ts, the pages that open it in customer-pages.test.ts.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useActionState: (await import('./support/action-state.ts')).useActionState,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
});

const nothing = { name: null, ico: null, dic: null, icDph: null, street: null, city: null, postalCode: null, phone: null, email: null, note: null };

/**
 * The form as the browser draws it once an action has answered. The fields of a firma are on the form when the admin chose Firma, a
 * choice the browser holds in the state of the radios and a render does not have: a form of a customer that is a firma has them.
 */
function drawn(state: CustomerFormState, type: CustomerType = 'company') {
  answered.state = state;
  return renderToStaticMarkup(createElement(CustomerForm, { action: addCustomer, customer: { id: '7d1c0a3e-0000-4000-8000-000000000001', type, ...nothing } }));
}

/** The id of the customer a saved form leads to the detail of; the test fails right there when it leads anywhere else. */
const savedAs = (call: Promise<unknown>) => ledTo(call, 'zakaznici');

test('a firma sent without an IČO is refused at the IČO field, and what was typed stays', async () => {
  const state = await addCustomer(null, form({ type: 'company', name: 'Prvá Firma' }));

  const html = drawn(state);

  expect(reasonOf(html, 'ico')).toBe('Vyplňte IČO firmy');
  expect(input(html, 'ico')).toContain('aria-invalid="true"');
  expect(valueOf(html, 'name')).toBe('Prvá Firma');
  expect(await listCustomers(admin, ctx.db)).toEqual([]);
});

test('every format is refused at its own field, with the reason it has, and what was typed stays', async () => {
  const sent = { type: 'company', name: 'Prvá Firma', ico: '1234567', dic: '202012345', icDph: '2020123456', postalCode: '8110', email: 'info@firma' };

  const html = drawn(await addCustomer(null, form(sent)));

  expect(['ico', 'dic', 'icDph', 'postalCode', 'email'].map((name) => [name, reasonOf(html, name)])).toEqual([
    ['ico', 'IČO má mať presne 8 číslic'],
    ['dic', 'DIČ má mať presne 10 číslic'],
    ['icDph', 'IČ DPH začína kódom krajiny (2 veľké písmená) a pokračuje 2 až 12 písmenami alebo číslicami, napríklad SK2020123456'],
    ['postalCode', 'PSČ má mať presne 5 číslic'],
    ['email', 'Zadajte e-mail v tvare meno@domena.sk'],
  ]);
  expect(['name', 'ico', 'dic', 'icDph', 'postalCode', 'email'].map((name) => [name, valueOf(html, name)])).toEqual([
    ['name', 'Prvá Firma'],
    ['ico', '1234567'],
    ['dic', '202012345'],
    ['icDph', '2020123456'],
    ['postalCode', '8110'],
    ['email', 'info@firma'],
  ]);
  expect(await listCustomers(admin, ctx.db)).toEqual([]);
});

test('a field that was right has no reason, and a customer without a name is refused at the name', async () => {
  const html = drawn(await addCustomer(null, form({ type: 'company', name: ' ', ico: '12345678', dic: '2020123456' })));

  expect(reasonOf(html, 'name')).toBe('Vyplňte názov, pri osobe meno a priezvisko');
  for (const name of ['ico', 'dic', 'icDph', 'postalCode', 'email']) expect(reasonOf(html, name), name).toBeNull();
});

test('the form leaves the format of an e-mail to the server, which says why: the browser would refuse it first, without the reason', () => {
  expect(drawn(null)).toMatch(/<form[^>]*\snoValidate=""/);
});

test('a second firma with an IČO that is taken is refused, its field names the first and leads to it, and only the first is saved', async () => {
  const first = idOf(await createCustomer(admin, { type: 'company', name: 'Prvá Firma', ico: '12345678' }, ctx.db));

  const html = drawn(await addCustomer(null, form({ type: 'company', name: 'Druhá Firma', ico: '12345678' })));

  expect(reasonOf(html, 'ico')).toBe('Firma s týmto IČO už existuje: Prvá Firma');
  expect(hrefOf(html, 'Prvá Firma')).toBe(`/zakaznici/${first}`);
  expect((await listCustomers(admin, ctx.db)).map(({ name }) => name)).toEqual(['Prvá Firma']);
});

test('a firma with a Czech IČ DPH and a PSČ written with a space is saved, leads to its detail, and has the PSČ without the space', async () => {
  const sent = { type: 'company', name: 'Prvá Firma', ico: '12345678', dic: '2020123456', icDph: 'CZ12345678', postalCode: '811 01', email: 'info@firma.sk' };

  const id = await savedAs(addCustomer(null, form(sent)));

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ type: 'company', name: 'Prvá Firma', ico: '12345678', dic: '2020123456', icDph: 'CZ12345678', postalCode: '81101', email: 'info@firma.sk' });
});

test('a firma with only a name and an IČO is saved, and so are an osoba and a firma with the same name', async () => {
  const sent = { name: 'Ján Novák' };

  const firma = await savedAs(addCustomer(null, form({ type: 'company', ico: '12345678', ...sent })));
  const osoba = await savedAs(addCustomer(null, form({ type: 'person', ...sent })));
  const another = await savedAs(addCustomer(null, form({ type: 'person', ...sent })));

  expect(new Set([firma, osoba, another]).size).toBe(3);
  expect((await listCustomers(admin, ctx.db)).map(({ name }) => name)).toEqual(['Ján Novák', 'Ján Novák', 'Ján Novák']);
});

test('an edit is saved and leads to the detail of the same customer, with what the form added to what it had', async () => {
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Stará Firma', ico: '12345678' }, ctx.db));
  const edited = { id, type: 'company', name: 'Stará Firma', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456', phone: '0905 123 456', note: 'Platí v hotovosti' };

  expect(await savedAs(editCustomer(null, form(edited)))).toBe(id);

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ ico: '12345678', dic: '2020123456', icDph: 'SK2020123456', phone: '0905 123 456', note: 'Platí v hotovosti' });
});

test('a firma saved as an osoba, as the form sends it without the fields of a firma, loses them, keeps the rest, and frees its IČO', async () => {
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Stará Firma', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456', note: 'Platí v hotovosti' }, ctx.db));

  await savedAs(editCustomer(null, form({ id, type: 'person', name: 'Ján Novák', note: 'Platí v hotovosti' })));

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ type: 'person', name: 'Ján Novák', ico: null, dic: null, icDph: null, note: 'Platí v hotovosti' });
  await savedAs(addCustomer(null, form({ type: 'company', name: 'Nová Firma', ico: '12345678' })));
});

test('an edit to the IČO of another firma is refused at the IČO field, which names that firma, and changes nothing', async () => {
  const other = idOf(await createCustomer(admin, { type: 'company', name: 'Prvá Firma', ico: '12345678' }, ctx.db));
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Druhá Firma', ico: '87654321' }, ctx.db));

  const html = drawn(await editCustomer(null, form({ id, type: 'company', name: 'Druhá Firma', ico: '12345678' })));

  expect(reasonOf(html, 'ico')).toBe('Firma s týmto IČO už existuje: Prvá Firma');
  expect(hrefOf(html, 'Prvá Firma')).toBe(`/zakaznici/${other}`);
  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ ico: '87654321' });
});
