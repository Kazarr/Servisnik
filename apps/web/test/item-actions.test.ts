import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { addToPriceList, editPriceListItem } from '../src/app/(app)/cennik/actions.ts';
import { addItemToWorkOrder, updateItemOfWorkOrder } from '../src/app/(app)/zakazky/actions.ts';
import { createCustomer } from '../src/dal/customers.ts';
import { createPriceListItem, getPriceListItem, searchPriceList } from '../src/dal/price-list.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, createWorkOrder, getWorkOrder } from '../src/dal/work-orders.ts';
import type { Database } from '../src/db/index.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { digestOf } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { idOf } from './support/id-of.ts';

// The Server Actions of the forms of an item (a Položka zákazky and a Položka cenníka), called as the admin's forms call
// them: what they answer when the Prirážka the form shows is no Prirážka or does not fit the prices, and what they do
// with a Diel sold below its Nákupná cena. The DAL is the real one, over the database of this file; who may call them is
// in forbidden.test.ts.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));
// A saved item asks Next.js to draw the page again, which outside a request has nothing to do.
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let orderId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));
  orderId = idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '1000', customerRequest: 'Výmena oleja' }, ctx.db));
});
afterAll(() => ctx.close());

/** What the form of a Diel sent: bought for 10,00 € and sold for 9,00 €, which is a Prirážka of -10 %. */
const sentPart = { kind: 'part', code: '', name: 'Brzdové doštičky', quantity: '2', unit: 'ks', purchasePrice: '10', markup: '-10', salePrice: '9', vatRate: '23' };
const part = (overrides: Record<string, string> = {}) => ({ ...sentPart, workOrderId: orderId, ...overrides });

const itemsOf = async (id: string) => (await getWorkOrder(admin, id, ctx.db))!.items;

const notAMarkup = 'Prirážka musí byť číslo od -100, najviac na 1 desatinné miesto';
const notFittingPrices = 'Prirážka nesedí s cenami. Upravte prirážku alebo predajnú cenu';

test('a Diel sold below its Nákupná cena is added with the negative Prirážka the form shows, and keeps the price it was sold for', async () => {
  const answer = await addItemToWorkOrder(null, form(part()));

  expect(answer).toBeNull();
  expect(await itemsOf(orderId)).toMatchObject([{ name: 'Brzdové doštičky', purchasePriceCents: 1000, salePriceCents: 900 }]);
});

test('a Diel whose Prirážka the prices do not make comes back to the form with the reason at the Prirážka and all that was typed, and is not added', async () => {
  const answer = await addItemToWorkOrder(null, form(part({ name: 'Nepridá sa', markup: '25' })));

  expect(answer).toEqual({
    values: { code: '', name: 'Nepridá sa', quantity: '2', unit: 'ks', purchasePrice: '10', markup: '25', salePrice: '9', vatRate: '23' },
    errors: { markup: notFittingPrices },
  });
  expect(await itemsOf(orderId)).not.toContainEqual(expect.objectContaining({ name: 'Nepridá sa' }));
});

test('a Prirážka with two decimals is no longer dropped without a word: it is refused at its field, with what was typed', async () => {
  const answer = await addItemToWorkOrder(null, form(part({ name: 'Nepridá sa ani toto', markup: '12,55' })));

  expect(answer).toMatchObject({ values: { name: 'Nepridá sa ani toto', markup: '12,55' }, errors: { markup: notAMarkup } });
  expect(await itemsOf(orderId)).not.toContainEqual(expect.objectContaining({ name: 'Nepridá sa ani toto' }));
});

test('the Prirážka is refused beside the other reasons, each at its own field', async () => {
  const answer = await addItemToWorkOrder(null, form(part({ name: '', markup: 'abc', salePrice: 'x' })));

  expect(answer).toMatchObject({ errors: { name: 'Vyplňte názov', markup: notAMarkup, salePrice: 'Cena musí byť 0 alebo viac, najviac na 2 desatinné miesta' } });
});

test('an item that is edited with a Prirážka its prices do not make is refused the same way and stays as it was', async () => {
  const itemId = idOf(await addItem(admin, orderId, { kind: 'part', name: 'Upravovaný', quantity: '1', purchasePrice: '10', salePrice: '12,50', vatRate: '23' }, ctx.db));
  const values = { code: '', name: 'Premenovaný', quantity: '1', unit: 'ks', purchasePrice: '10', markup: '30', salePrice: '12,50', vatRate: '23' };

  const answer = await updateItemOfWorkOrder(null, form({ itemId, ...values }));

  expect(answer).toEqual({ values, errors: { markup: notFittingPrices } });
  expect(await itemsOf(orderId)).toContainEqual(expect.objectContaining({ id: itemId, name: 'Upravovaný' }));
});

test('an item that is edited with the Prirážka its prices make is saved, and the form goes back to the Zákazka', async () => {
  const itemId = idOf(await addItem(admin, orderId, { kind: 'part', name: 'Upravený', quantity: '1', purchasePrice: '10', salePrice: '12,50', vatRate: '23' }, ctx.db));

  const digest = await digestOf(
    updateItemOfWorkOrder(null, form({ itemId, name: 'Upravený a uložený', quantity: '1', unit: 'ks', purchasePrice: '10', markup: '25', salePrice: '12,50', vatRate: '23', code: '' })),
  );

  expect(digest).toMatch(new RegExp(`^NEXT_REDIRECT;.*/zakazky/${orderId};`));
  expect(await itemsOf(orderId)).toContainEqual(expect.objectContaining({ id: itemId, name: 'Upravený a uložený' }));
});

// The Cenník has the form of a Položka zákazky without a quantity, and the same Prirážka.

const sentPriceListItem = { kind: 'part', code: '', name: 'Brzdová doštička', unit: 'ks', purchasePrice: '20', markup: '50', salePrice: '30', vatRate: '23' };

test('a Položka cenníka whose Prirážka the prices do not make is refused at the Prirážka with what was typed, and is not added', async () => {
  const typed = { ...sentPriceListItem, name: 'Cenníková, ktorá sa nepridá', markup: '40' };

  const answer = await addToPriceList(null, form(typed));

  expect(answer).toEqual({
    values: { code: '', name: 'Cenníková, ktorá sa nepridá', unit: 'ks', purchasePrice: '20', markup: '40', salePrice: '30', vatRate: '23' },
    errors: { markup: notFittingPrices },
  });
  expect((await searchPriceList(admin, { query: 'nepridá' }, ctx.db)).items).toEqual([]);
});

test('a Položka cenníka with the Prirážka its prices make is added, and one sold below its Nákupná cena is added with its negative Prirážka', async () => {
  const withMarkup = { ...sentPriceListItem, code: 'ZAPIS-1', name: 'Cenníková s prirážkou' };
  const belowCost = { ...sentPriceListItem, code: 'ZAPIS-2', name: 'Cenníková pod nákupom', markup: '-50', salePrice: '10' };
  expect(await digestOf(addToPriceList(null, form(withMarkup)))).toMatch(/^NEXT_REDIRECT;.*\/cennik;/);
  expect(await digestOf(addToPriceList(null, form(belowCost)))).toMatch(/^NEXT_REDIRECT;.*\/cennik;/);

  // By name in the Slovak alphabet: "pod nákupom" before "s prirážkou".
  expect((await searchPriceList(admin, { query: 'zapis' }, ctx.db)).items).toMatchObject([
    { code: 'ZAPIS-2', purchasePriceCents: 2000, salePriceCents: 1000 },
    { code: 'ZAPIS-1', purchasePriceCents: 2000, salePriceCents: 3000 },
  ]);
});

test('a Položka cenníka that is edited with a Prirážka that is no Prirážka is refused at its field and stays as it was', async () => {
  const itemId = idOf(await createPriceListItem(admin, { kind: 'part', name: 'Upravovaná cenníková', purchasePrice: '20', salePrice: '30' }, ctx.db));
  const typed = { ...sentPriceListItem, name: 'Premenovaná cenníková', markup: '50,55' };

  const answer = await editPriceListItem(null, form({ itemId, ...typed }));

  expect(answer).toMatchObject({ values: { name: 'Premenovaná cenníková', markup: '50,55' }, errors: { markup: notAMarkup } });
  expect(await getPriceListItem(admin, itemId, ctx.db)).toMatchObject({ name: 'Upravovaná cenníková' });
});
