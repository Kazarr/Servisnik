import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { listCustomers } from '../src/dal/customers.ts';
import { searchPriceList } from '../src/dal/price-list.ts';
import { getRates } from '../src/dal/settings.ts';
import { listUsers } from '../src/dal/users.ts';
import { searchVehicles } from '../src/dal/vehicles.ts';
import { addItem, getWorkOrder, listWorkOrdersOfVehicle } from '../src/dal/work-orders.ts';
import { idOf } from '../test/support/id-of.ts';
import { readPdf } from '../test/support/pdf.ts';
import { seedUser, setRole } from '../test/support/users.ts';
import { dayFromToday, expect, fillVehicle, runTag, seedMechanik, signInAs, test, vinOf } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

test('the mechanik signs in to Zákazky only, sees no amount in the list, and every other page leads him back', async ({ page }) => {
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  await signInAs(page, await seedMechanik(db, tag));
  await page.goto(`/zakazky?od=${dayFromToday(0)}`); // other workers make work orders too: the days from today keep this one on the first page

  const main = page.locator('main');
  await expect(page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link')).toHaveText(['Zákazky']);
  await expect(main.locator('h1')).toHaveText('Zákazky');
  const row = main.getByRole('row', { name: new RegExp(order.number) });
  await expect(row.getByRole('cell')).toHaveText([order.number, order.customerName, new RegExp(order.vin), 'Prijatá', '']);
  await expect(row.getByRole('link')).toHaveText(order.number); // the number opens the detail he has, without prices
  await expect(main).not.toContainText('€');
  await expect(main.getByRole('link', { name: 'Nová zákazka' })).toHaveCount(0);

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
    `/vozidla/${order.vehicleId}/prepis`,
    '/zakazky/nova',
    `/zakazky/nova?vozidlo=${order.vehicleId}`,
    '/zakazky/nova/nove-vozidlo',
    `/zakazky/nova/nove-vozidlo?zakaznik=${order.customerId}`,
    '/zakazky/nova/nove-vozidlo?novy=zakaznik',
    `/zakazky/${order.orderId}/upravit`,
    `/zakazky/${order.orderId}/polozky/${randomUUID()}`,
    '/cennik',
    '/cennik/nova/diel',
    `/cennik/${randomUUID()}/upravit`,
    '/nastavenia',
  ];
  for (const path of elsewhere) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/zakazky$/);
    await expect(main.locator('h1'), path).toHaveText('Zákazky');
  }
});

// The smoke path of the detail he has (spec #95, Mechanik). That the shape has no price key is checked at the Data Access Layer
// (test/unpriced-work-order.test.ts), what the page draws and links in test/unpriced-work-order-view.test.ts; here the built page is
// searched for the prices, in the HTML and in the data that Next sends with it.
test('the mechanik opens a Zákazka from the list, sees its items and no price anywhere on the page, and downloads the zákazkový list', async ({ page }) => {
  test.slow(); // the server starts its Chromium with the first print, and on a host that other runs share that takes long
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  await addItem(admin, order.orderId, { kind: 'part', code: `OF-${tag}`, name: `Olejový filter ${tag}`, quantity: '2', unit: 'ks', purchasePrice: '4321,09', unitPrice: '8765,43', vatRate: '23' }, db);
  await signInAs(page, await seedMechanik(db, tag));
  await page.goto(`/zakazky?od=${dayFromToday(0)}`);

  const main = page.locator('main');
  await main.getByRole('link', { name: order.number }).click();
  await expect(main.locator('h1')).toHaveText(order.number);
  await expect(main.getByRole('row', { name: new RegExp(tag) }).getByRole('cell')).toHaveText(['Diel', `OF-${tag}`, `Olejový filter ${tag}`, '2 ks']);
  await expect(main).toContainText(order.customerName);
  await expect(main).not.toContainText('€');
  expect(await page.content(), 'the page, with the data that Next sends with it').not.toMatch(/8765[,.]43|876543|4321[,.]09|432109/);

  const downloading = page.waitForEvent('download');
  await main.getByRole('link', { name: 'Zákazkový list' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${order.number}-zakazkovy-list.pdf`);
  expect(readPdf(readFileSync((await download.path())!))[0]!.text).toContain(order.customerName);
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
  await fillVehicle(vehiclePage, vinOf(tag, 'ZZZ00000000'), 'Škoda', 'Fabia');
  const editPage = await context.newPage();
  await editPage.goto(`/vozidla/${order.vehicleId}/upravit`);
  await editPage.getByLabel('Model').fill('Fabia');
  const orderPage = await context.newPage();
  await orderPage.goto(`/zakazky/nova?vozidlo=${order.vehicleId}`);
  await orderPage.getByLabel('Kilometre pri príjme').fill('500');
  await orderPage.getByLabel('Požiadavka zákazníka').fill('Nemala by sa uložiť');
  const intakePage = await context.newPage();
  await intakePage.goto(`/zakazky/nova/nove-vozidlo?zakaznik=${order.customerId}`);
  await fillVehicle(intakePage, vinOf(tag, 'YYY00000000'), 'Škoda', 'Fabia');
  await intakePage.getByLabel('Kilometre pri príjme').fill('500');
  await intakePage.getByLabel('Požiadavka zákazníka').fill('Nemala by sa uložiť');
  const headerPage = await context.newPage();
  await headerPage.goto(`/zakazky/${order.orderId}/upravit`);
  await headerPage.getByLabel('Kilometre pri príjme').fill('777');
  const itemId = idOf(await addItem(admin, order.orderId, { kind: 'part', name: 'Zostane', quantity: '1', unitPrice: '10' }, db));
  const detailPage = await context.newPage();
  await detailPage.goto(`/zakazky/${order.orderId}`);
  const labourForm = detailPage.getByRole('form', { name: 'Pridať prácu' });
  await labourForm.getByLabel('Názov', { exact: true }).fill('Nemala by sa pridať');
  await labourForm.getByLabel('Množstvo', { exact: true }).fill('1');
  await labourForm.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('10');
  const itemPage = await context.newPage();
  await itemPage.goto(`/zakazky/${order.orderId}/polozky/${itemId}`);
  await itemPage.getByLabel('Názov', { exact: true }).fill('Nemal by sa zmeniť');
  const priceListPage = await context.newPage();
  await priceListPage.goto('/cennik/nova/diel');
  await priceListPage.getByLabel('Názov', { exact: true }).fill(`Nemal by sa uložiť ${tag}`);
  await priceListPage.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('10');
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
  await intakePage.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(intakePage.locator('main').getByRole('alert')).toHaveText(message);
  await expect(intakePage.getByLabel('Model')).toHaveValue('Fabia');
  await headerPage.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(headerPage.locator('main').getByRole('alert')).toHaveText(message);
  await labourForm.getByRole('button', { name: 'Pridať prácu' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText(message);
  await detailPage.getByRole('button', { name: 'Zmazať Zostane' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText([message, message]);
  await detailPage.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(detailPage.locator('main').getByRole('alert')).toHaveText([message, message, message]);
  await itemPage.getByRole('button', { name: 'Uložiť zmeny' }).click();
  await expect(itemPage.locator('main').getByRole('alert')).toHaveText(message);
  await priceListPage.getByRole('button', { name: 'Pridať do cenníka' }).click();
  await expect(priceListPage.locator('main').getByRole('alert')).toHaveText(message);
  await settingsPage.getByRole('button', { name: 'Uložiť sadzby' }).click();
  await expect(settingsPage.locator('main').getByRole('alert')).toHaveText(message);
  await usersPage.getByRole('button', { name: 'Založiť používateľa' }).click();
  await expect(usersPage.locator('main').getByRole('alert')).toHaveText(message);

  // Nothing was saved: only the records the spec made through the DAL exist.
  const names = (await listCustomers(admin, db)).map((customer) => customer.name).filter((name) => name.includes(tag));
  expect(names).toEqual([order.customerName]);
  // The tag is in the VIN of the seeded vehicle and of the one the form tried to add, and in the name of the owner of both.
  const { vehicles } = await searchVehicles(admin, { query: tag }, db);
  expect(vehicles.map((vehicle) => vehicle.vin)).toEqual([order.vin]);
  expect(vehicles[0]).toMatchObject({ make: 'Škoda', model: 'Octavia' });
  expect((await listWorkOrdersOfVehicle(admin, order.vehicleId, db)).map(({ number }) => number)).toEqual([order.number]);
  expect(await getWorkOrder(admin, order.orderId, db)).toMatchObject({ status: 'received', completedOn: null, items: [{ id: itemId, name: 'Zostane' }], mileageKm: 1000 });
  expect((await searchPriceList(admin, { query: tag }, db)).items).toEqual([]);
  expect(await getRates(admin, db)).toMatchObject({ markupPercent: 0 });
  expect((await listUsers(admin, db)).filter(({ email }) => email.includes(tag)).map(({ email }) => email)).toEqual([user.email]);
});
