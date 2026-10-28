import { readFileSync } from 'node:fs';
import { readPdf } from '../test/support/pdf.ts';
import { expect, runTag, seedMechanik, signIn, signInAs, test } from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

// The zákazkový list (spec #95, Tlačivá): the production build prints it with its own Chromium, so this is the one
// place where the standalone server, `playwright-core` and the browser of the machine meet.
test('the admin downloads the zákazkový list from the detail of a Zákazka, and the mechanik and nobody else may have it too', async ({
  page,
  browser,
  baseURL,
  request,
}) => {
  test.slow(); // two Chromiums print: the one of the server starts with the first print, and the host is shared
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  const path = `/zakazky/${order.orderId}/zakazkovy-list`;

  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  const downloading = page.waitForEvent('download');
  await page.locator('main').getByRole('link', { name: 'Zákazkový list' }).click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe(`${order.number}-zakazkovy-list.pdf`);
  const pages = readPdf(readFileSync((await download.path())!));
  expect(pages).toHaveLength(1);
  expect(pages[0]!.width).toBeGreaterThan(595); // A4: 595 × 842 points
  expect(pages[0]!.width).toBeLessThan(597);
  expect(pages[0]!.height).toBeGreaterThan(842);
  expect(pages[0]!.height).toBeLessThan(844);
  const text = pages[0]!.text;
  for (const line of [order.number, order.customerName, order.vin, `Výmena oleja ${tag}`, '1 000 km', 'Zákazkový list', 'Podpis zákazníka'])
    expect(text, line).toContain(line);
  expect(text.split('\n').at(-1)).toBe('Strana 1/1');
  expect(text).not.toContain('€');
  expect(pages[0]!.missingGlyphs).toBe(0);

  // The mechanik has no page of a Zákazka yet, but the form he prints for the car is his, with its address.
  const elsewhere = await browser.newContext({ baseURL });
  const mechanikPage = await elsewhere.newPage();
  await signInAs(mechanikPage, await seedMechanik(db, tag));
  const printed = await mechanikPage.request.get(path);
  expect(printed.status()).toBe(200);
  expect(printed.headers()['content-type']).toBe('application/pdf');
  expect(printed.headers()['content-disposition']).toBe(`attachment; filename="${order.number}-zakazkovy-list.pdf"`);
  expect(readPdf(new Uint8Array(await printed.body()))[0]!.text).toContain(order.number);
  await elsewhere.close();

  // Nobody signed in is sent to the login page, and one with a cookie that is no session is refused: no PDF either way.
  const unsigned = await request.get(path, { maxRedirects: 0 });
  expect(unsigned.status()).toBe(307);
  expect(new URL(unsigned.headers()['location']!, baseURL).pathname).toBe('/login');
  const fake = await request.get(path, { headers: { cookie: 'better-auth.session_token=fake.cookie' }, maxRedirects: 0 });
  expect(fake.status()).toBe(401);
  expect(await fake.json()).toEqual({ error: 'Nie ste prihlásený.' });
});
