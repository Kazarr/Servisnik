import { randomBytes, randomUUID } from 'node:crypto';
import { listCustomers } from '../src/dal/customers.ts';
import { getRates } from '../src/dal/settings.ts';
import { listVehicles } from '../src/dal/vehicles.ts';
import { addItem, getWorkOrder, listWorkOrders } from '../src/dal/work-orders.ts';
import { idOf } from '../test/support/id-of.ts';
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
    `/vozidla/novy?zakaznik=${order.customerId}`,
    `/vozidla/${order.vehicleId}`,
    `/zakazky/nova?vozidlo=${order.vehicleId}`,
    `/zakazky/${order.orderId}`,
    `/zakazky/${order.orderId}/polozky/${randomUUID()}`,
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
  const orderPage = await context.newPage();
  await orderPage.goto(`/zakazky/nova?vozidlo=${order.vehicleId}`);
  await orderPage.getByLabel('Kilometre pri príjme').fill('500');
  await orderPage.getByLabel('Požiadavka zákazníka').fill('Nemala by sa uložiť');
  const itemId = idOf(await addItem(admin, order.orderId, { kind: 'part', name: 'Zostane', quantity: '1', unitPrice: '10' }, db));
  const detailPage = await context.newPage();
  await detailPage.goto(`/zakazky/${order.orderId}`);
  const labourForm = detailPage.getByRole('form', { name: 'Pridať prácu' });
  await labourForm.getByLabel('Názov', { exact: true }).fill('Nemala by sa pridať');
  await labourForm.getByLabel('Množstvo', { exact: true }).fill('1');
  await labourForm.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('10');
  const editPage = await context.newPage();
  await editPage.goto(`/zakazky/${order.orderId}/polozky/${itemId}`);
  await editPage.getByLabel('Názov', { exact: true }).fill('Nemal by sa zmeniť');
  const settingsPage = await context.newPage();
  await settingsPage.goto('/nastavenia');
  await settingsPage.getByLabel('Prirážka na diely (%)').fill('77');

  await setRole(db, user.email, 'mechanik');

  const message = 'Na túto akciu nemáte oprávnenie';
  await page.getByRole('button', { name: 'Uložiť zákazníka' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText(message);
  await expect(page.getByLabel('Názov')).toHaveValue(`Nemal by sa uložiť ${tag}`);
  await vehiclePage.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(vehiclePage.locator('main').getByRole('alert')).toHaveText(message);
  await orderPage.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(orderPage.locator('main').getByRole('alert')).toHaveText(message);
  await labourForm.getByRole('button', { name: 'Pridať prácu' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText(message);
  await detailPage.getByRole('button', { name: 'Zmazať Zostane' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText([message, message]);
  await detailPage.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText([message, message, message]);
  await editPage.getByRole('button', { name: 'Uložiť zmeny' }).click();
  await expect(editPage.locator('main').getByRole('alert')).toHaveText(message);
  await settingsPage.getByRole('button', { name: 'Uložiť sadzby' }).click();
  await expect(settingsPage.locator('main').getByRole('alert')).toHaveText(message);

  // Nothing was saved: only the records the spec made through the DAL exist.
  const names = (await listCustomers(admin, db)).map((customer) => customer.name).filter((name) => name.includes(tag));
  expect(names).toEqual([order.customerName]);
  const vins = (await listVehicles(admin, db)).map((vehicle) => vehicle.vin).filter((vin) => vin.includes(tag.toUpperCase()));
  expect(vins).toEqual([order.vin]);
  const orders = (await listWorkOrders(admin, db)).filter((found) => found.customer.name === order.customerName);
  expect(orders.map(({ number }) => number)).toEqual([order.number]);
  expect(await getWorkOrder(admin, order.orderId, db)).toMatchObject({ status: 'received', completedOn: null, items: [{ id: itemId, name: 'Zostane' }] });
  expect(await getRates(admin, db)).toMatchObject({ markupPercent: 0 });
});
