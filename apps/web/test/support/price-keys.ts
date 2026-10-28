// Words that make a key a price: prices, sums, VAT, margins, discounts, fees, currencies and invoices,
// in English and Slovak. A key is split into words ("unitPriceCents" is unit, price, cents) so that
// "internet" is not "net".
const priceWords = new Set([
  'price', 'prices', 'cena', 'ceny', 'cost', 'costs', 'cents', 'eur', 'rate', 'sadzba', 'fee', 'fees',
  'amount', 'amounts', 'sum', 'suma', 'total', 'totals', 'subtotal', 'subtotals', 'zaklad', 'net', 'gross',
  'vat', 'dph', 'margin', 'marza', 'markup', 'prirazka', 'discount', 'zlava', 'invoice', 'faktura',
]);

// A word starts at a capital after a lower-case letter or digit ("unitPrice"), and a run of capitals is a
// word of its own that ends before the capital which starts a lower-case one ("VATRate" is VAT, Rate).
const wordsOf = (key: string) =>
  key
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);

// The only two keys with a price word that are none: the IČ DPH and the platiteľ DPH of the autoservis (Údaje autoservisu)
// identify it on the tlačivá a mechanik prints, and are no amount. Exactly these keys, so `vatRate` or `icDphAmount` stay prices.
const notPriceKeys = new Set(['icDph', 'vatPayerType']);

const isPriceKey = (key: string) => !notPriceKeys.has(key) && wordsOf(key).some((word) => priceWords.has(word));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

/**
 * The path of every price key anywhere in `response`, however deep in objects and arrays, e.g.
 * `$[0].items[1].unitPriceCents`; empty when there is none. A mechanik must never get one from the
 * Data Access Layer (`expect(findPriceKeys(response)).toEqual([])`). A price key is reported as a
 * whole, its value is not searched; `icDph` and `vatPayerType` are not price keys (`notPriceKeys`).
 */
export function findPriceKeys(response: unknown, path = '$'): string[] {
  if (Array.isArray(response)) return response.flatMap((item, index) => findPriceKeys(item, `${path}[${index}]`));
  if (!isObject(response)) return [];
  return Object.entries(response).flatMap(([key, value]) =>
    isPriceKey(key) ? [`${path}.${key}`] : findPriceKeys(value, `${path}.${key}`),
  );
}
