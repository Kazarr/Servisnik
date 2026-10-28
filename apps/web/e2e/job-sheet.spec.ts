import { readPdf } from '../test/support/pdf.ts';
import { downloadPdf, expect, runTag, seedMechanik, signIn, signInAs, test } from './fixtures.ts';
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
  test.slow(); // the server starts its Chromium with the first print, and on a host that other runs share that takes long
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  const path = `/zakazky/${order.orderId}/zakazkovy-list`;

  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  const { filename, text } = await downloadPdf(page, 'Zákazkový list', path);

  // What the build that ships has to get right: the name, the type and a line of the data. The page, the letters and
  // the footer are checked where the PDF is made cheaply (test/pdf.test.ts, test/job-sheet-response.test.ts).
  expect(filename).toBe(`${order.number}-zakazkovy-list.pdf`);
  expect(text).toContain(order.customerName);

  // The mechanik prints it too, from the detail of a Zákazka he has (e2e/mechanik.spec.ts): here the address answers him directly.
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
