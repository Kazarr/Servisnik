import { randomBytes } from 'node:crypto';
import { listCustomers } from '../src/dal/customers.ts';
import { getRates } from '../src/dal/settings.ts';
import { listUsers } from '../src/dal/users.ts';
import { listVehicles } from '../src/dal/vehicles.ts';
import { getWorkOrder, listWorkOrders } from '../src/dal/work-orders.ts';
import { seedUser, setRole } from '../test/support/users.ts';
import { expect, runTag, signInAs, test, vinOf } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

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
  const tag = runTag();
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
    `/zakaznici/${order.customerId}/upravit`,
    '/vozidla',
    '/vozidla/novy',
    `/vozidla/novy?zakaznik=${order.customerId}`,
    `/vozidla/${order.vehicleId}`,
    `/vozidla/${order.vehicleId}/upravit`,
    `/zakazky/nova?vozidlo=${order.vehicleId}`,
    `/zakazky/${order.orderId}`,
    '/nastavenia',
  ];
  for (const path of elsewhere) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/zakazky$/);
    await expect(main.locator('h1'), path).toHaveText('Zákazky');
  }
});

test('forms and buttons used after the admin became a mechanik answer with a message and change nothing', async ({ page, context }) => {
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  const user = { email: `admin-${tag}@autoservis.test`, password: randomBytes(12).toString('base64url') };
  await seedUser(db, { ...user, role: 'admin' });
  await signInAs(page, user);

  // The Rola counts from the next request: the forms are opened while the user is still an admin.
  await page.goto('/zakaznici/novy');
  await page.getByLabel('Názov').fill(`Nemal by sa uložiť ${tag}`);
  const vehiclePage = await context.newPage();
  await vehiclePage.goto(`/vozidla/novy?zakaznik=${order.customerId}`);
  await vehiclePage.getByLabel('VIN').fill(vinOf(tag, 'ZZZ00000000'));
  await vehiclePage.getByLabel('Značka').fill('Škoda');
  await vehiclePage.getByLabel('Model').fill('Fabia');
  const editPage = await context.newPage();
  await editPage.goto(`/vozidla/${order.vehicleId}/upravit`);
  await editPage.getByLabel('Model').fill('Fabia');
  const orderPage = await context.newPage();
  await orderPage.goto(`/zakazky/nova?vozidlo=${order.vehicleId}`);
  await orderPage.getByLabel('Kilometre pri príjme').fill('500');
  await orderPage.getByLabel('Požiadavka zákazníka').fill('Nemala by sa uložiť');
  const detailPage = await context.newPage();
  await detailPage.goto(`/zakazky/${order.orderId}`);
  await detailPage.getByLabel('Názov', { exact: true }).fill('Nemala by sa pridať');
  await detailPage.getByLabel('Množstvo (h)').fill('1');
  await detailPage.getByLabel('Cena za jednotku bez DPH (€)').fill('10');
  const settingsPage = await context.newPage();
  await settingsPage.goto('/nastavenia');
  await settingsPage.getByLabel('Prirážka na diely (%)').fill('77');
  const usersPage = await context.newPage();
  await usersPage.goto('/nastavenia');
  await usersPage.getByLabel('Meno používateľa').fill(`Nový ${tag}`);
  await usersPage.getByLabel('E-mail používateľa').fill(`novy-${tag}@autoservis.test`);
  await usersPage.getByLabel('Počiatočné heslo používateľa').fill(randomBytes(12).toString('base64url'));

  await setRole(db, user.email, 'mechanik');

  const message = 'Na túto akciu nemáte oprávnenie';
  await page.getByRole('button', { name: 'Uložiť zákazníka' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText(message);
  await expect(page.getByLabel('Názov')).toHaveValue(`Nemal by sa uložiť ${tag}`);
  await vehiclePage.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(vehiclePage.locator('main').getByRole('alert')).toHaveText(message);
  await editPage.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(editPage.locator('main').getByRole('alert')).toHaveText(message);
  await orderPage.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(orderPage.locator('main').getByRole('alert')).toHaveText(message);
  await detailPage.getByRole('button', { name: 'Pridať prácu' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText(message);
  await detailPage.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText([message, message]);
  await settingsPage.getByRole('button', { name: 'Uložiť sadzby' }).click();
  await expect(settingsPage.locator('main').getByRole('alert')).toHaveText(message);
  await usersPage.getByRole('button', { name: 'Založiť používateľa' }).click();
  await expect(usersPage.locator('main').getByRole('alert')).toHaveText(message);

  // Nothing was saved: only the records the spec made through the DAL exist.
  const names = (await listCustomers(admin, db)).map((customer) => customer.name).filter((name) => name.includes(tag));
  expect(names).toEqual([order.customerName]);
  const vins = (await listVehicles(admin, db)).map((vehicle) => vehicle.vin).filter((vin) => vin.includes(tag.toUpperCase()));
  expect(vins).toEqual([order.vin]);
  expect((await listVehicles(admin, db)).find((vehicle) => vehicle.vin === order.vin)).toMatchObject({ make: 'Škoda', model: 'Octavia' });
  const orders = (await listWorkOrders(admin, db)).filter((found) => found.customer.name === order.customerName);
  expect(orders.map(({ number }) => number)).toEqual([order.number]);
  expect(await getWorkOrder(admin, order.orderId, db)).toMatchObject({ status: 'received', completedOn: null, items: [] });
  expect(await getRates(admin, db)).toMatchObject({ markupPercent: 0 });
  expect((await listUsers(admin, db)).filter(({ email }) => email.includes(tag)).map(({ email }) => email)).toEqual([user.email]);
});
