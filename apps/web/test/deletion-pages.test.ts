import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import VehiclePage from '../src/app/(app)/vozidla/[id]/page.tsx';
import CustomerPage from '../src/app/(app)/zakaznici/[id]/page.tsx';
import type { Database } from '../src/db/index.ts';
import { savedIn, vin } from './support/customer-vehicle.ts';
import { createTestDb } from './support/db.ts';
import { truncateTables } from './support/reset.ts';

// Mazanie (spec #67), the buttons: the detail of a Zákazník or of a Vozidlo offers "Zmazať" only while nothing links to it,
// and a Zákazník or Vozidlo with a link has no button to press. The pages are async Server Components, which Vitest cannot
// render (docs/adr/0001-stack.md); each is called here as the function it is, over the real DAL and the database of this
// file, and what it returns is rendered. What the delete itself answers is in deletion-actions.test.ts and deletion.test.ts;
// e2e/deletion.spec.ts follows one delete path in a browser.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => {
  const { admin } = await import('./support/dal-users.ts');
  return { currentUser: async () => admin, currentUserWith: async () => admin };
});
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
});

const { person, vehicleOf, orderOn } = savedIn(() => ctx.db);

const customerPage = async (id: string) => renderToStaticMarkup(await CustomerPage({ params: Promise.resolve({ id }) }));
const vehiclePage = async (id: string) => renderToStaticMarkup(await VehiclePage({ params: Promise.resolve({ id }) }));
/** What the page asks the admin to press to start a delete: the label of each `<summary>` that opens a question. */
const deleteButtons = (html: string) => [...html.matchAll(/<summary>(.*?)<\/summary>/g)].map(([, label]) => label);

test('a Zákazník with no Vozidlo and no Zákazka has the button to delete him', async () => {
  const id = await person();

  expect(deleteButtons(await customerPage(id))).toEqual(['Zmazať zákazníka']);
});

test('a Zákazník who is the Majiteľ of a Vozidlo has no button to delete him, and his page lists the Vozidlo', async () => {
  const id = await person();
  await vehicleOf(id);

  const html = await customerPage(id);

  expect(html).toContain(`>${vin}</a>`);
  expect(deleteButtons(html)).toEqual([]);
});

test('a Zákazník with a Zákazka and no Vozidlo has no button to delete him, and his page lists the Zákazka', async () => {
  const owner = await person('Majiteľ');
  const id = await person();
  const { number } = await orderOn(await vehicleOf(owner), id);

  const html = await customerPage(id);

  expect(html).toContain('Zatiaľ žiadne vozidlo.');
  expect(html).toContain(`>${number}</a>`);
  expect(deleteButtons(html)).toEqual([]);
});

test('a Vozidlo with no Zákazka has the button to delete it', async () => {
  const id = await vehicleOf(await person());

  expect(deleteButtons(await vehiclePage(id))).toEqual(['Zmazať vozidlo']);
});

test('a Vozidlo with a Zákazka has no button to delete it, and its page lists the Zákazka', async () => {
  const id = await vehicleOf(await person());
  const { number } = await orderOn(id);

  const html = await vehiclePage(id);

  expect(html).toContain(`>${number}</a>`);
  expect(deleteButtons(html)).toEqual([]);
});
