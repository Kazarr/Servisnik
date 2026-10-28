import { randomBytes } from 'node:crypto';
import { seedUser } from '../test/support/users.ts';
import { expect, signInAs, test } from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** A mechanik made straight in the database, with a tag in his e-mail so that specs do not meet each other's users. */
async function seedMechanik(tag: string) {
  const mechanik = { email: `mechanik-${tag}@autoservis.test`, password: randomBytes(12).toString('base64url') };
  await seedUser(db, { ...mechanik, role: 'mechanik' });
  return mechanik;
}

test('the mechanik signs in to Zákazky only, sees the number as text and no amount, and every other page leads him back', async ({ page }) => {
  const tag = randomBytes(3).toString('hex');
  const order = await seedWorkOrder(db, tag);
  await signInAs(page, await seedMechanik(tag));

  const main = page.locator('main');
  await expect(page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link')).toHaveText(['Zákazky']);
  await expect(main.locator('h1')).toHaveText('Zákazky');
  const row = main.getByRole('row', { name: new RegExp(order.number) });
  await expect(row.getByRole('cell')).toHaveText([order.number, order.customerName, new RegExp(order.vin), 'Prijatá']);
  await expect(row.getByRole('link')).toHaveCount(0);
  await expect(main).not.toContainText('€');

  const elsewhere = [
    '/zakaznici',
    '/zakaznici/novy',
    `/zakaznici/${order.customerId}`,
    '/vozidla',
    `/vozidla/novy?zakaznik=${order.customerId}`,
    `/vozidla/${order.vehicleId}`,
    `/zakazky/nova?vozidlo=${order.vehicleId}`,
    `/zakazky/${order.orderId}`,
  ];
  for (const path of elsewhere) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/zakazky$/);
    await expect(main.locator('h1'), path).toHaveText('Zákazky');
  }
});
