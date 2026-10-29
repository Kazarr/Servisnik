import { addItem, changeWorkOrderStatus } from '../src/dal/work-orders.ts';
import { downloadPdf, expect, runTag, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

// The cenová ponuka and the odovzdávací protokol (spec #95, Tlačivá): the smoke path of the two forms of the admin from the
// button on the detail of a Zákazka to the PDF. What is on them, the pages and who may have them are checked where the PDF
// is made cheaply (test/print-forms-response.test.ts); the zákazkový list has its own spec (job-sheet.spec.ts).
// The Zákazka is Hotová, the status in which the customer takes the vehicle over and the odovzdávací protokol has its button.
test('the admin downloads the cenová ponuka and the odovzdávací protokol from the detail of a Zákazka', async ({ page }) => {
  test.slow(); // the server starts its Chromium with the first print, and on a host that other runs share that takes long
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  await addItem(admin, order.orderId, { kind: 'labour', name: `Výmena oleja ${tag}`, quantity: '1', unitPrice: '40', vatRate: '23' }, db);
  await changeWorkOrderStatus(admin, order.orderId, { to: 'done' }, db);

  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  for (const { button, file, shows } of [
    { button: 'Cenová ponuka', file: 'cenova-ponuka', shows: '49,20 €' }, // 40,00 € and 23 % VAT
    { button: 'Odovzdávací protokol', file: 'odovzdavaci-protokol', shows: 'Podpis autoservisu' },
  ]) {
    const { filename, text } = await downloadPdf(page, button, `/zakazky/${order.orderId}/${file}`);

    expect(filename, button).toBe(`${order.number}-${file}.pdf`);
    for (const line of [order.number, order.customerName, `Výmena oleja ${tag}`, shows]) expect(text, `${button}: ${line}`).toContain(line);
  }
});
