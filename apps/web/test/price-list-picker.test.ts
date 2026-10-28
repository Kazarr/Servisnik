import { expect, test, vi } from 'vitest';
import { addPriceListItemToWorkOrder } from '../src/app/(app)/zakazky/actions.ts';

// The "Pridať" button of an item found in the Cenník on a Zákazka tells the admin why the item was not added. The
// reasons are the DAL's (work-orders.test.ts); here is the message each one gets. The DAL answers what the test says.
const { addItemFromPriceList } = vi.hoisted(() => ({ addItemFromPriceList: vi.fn() }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/dal/work-orders.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), addItemFromPriceList }));

const id = '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10';

function pressed() {
  const data = new FormData();
  data.set('workOrderId', id);
  data.set('priceListItemId', id);
  return data;
}

test.each([
  [{ vatRate: 'not-offered' }, 'Sadzba DPH tejto položky cenníka už nie je v Nastaveniach. Upravte položku cenníka.'],
  [{ priceListItem: 'unknown' }, 'Položka už v cenníku nie je'],
  [{ workOrder: 'not-editable' }, 'Položky sa dajú meniť len na rozpracovanej zákazke'],
])('an item of the Cenník that is refused with %j gets the message %j at the button', async (errors, error) => {
  addItemFromPriceList.mockResolvedValue({ ok: false, errors });

  expect(await addPriceListItemToWorkOrder(null, pressed())).toEqual({ error });
});
