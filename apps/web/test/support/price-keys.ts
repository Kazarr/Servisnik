// Words that make a key a price: prices, sums, VAT, margins, discounts and invoices, in English and
// Slovak. A key is split into words ("unitPriceCents" is unit, price, cents) so that "internet" is not "net".
const priceWords = new Set([
  'price', 'prices', 'cena', 'ceny', 'cost', 'costs', 'cents', 'rate', 'sadzba',
  'amount', 'amounts', 'sum', 'suma', 'total', 'totals', 'net', 'gross',
  'vat', 'dph', 'margin', 'marza', 'markup', 'prirazka', 'discount', 'zlava', 'invoice', 'faktura',
]);

const wordsOf = (key: string) =>
  key
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

/**
 * The path of every price key anywhere in `response`, however deep in objects and arrays, e.g.
 * `$[0].items[1].unitPriceCents`; empty when there is none. A mechanik must never get one from the
 * Data Access Layer (`expect(findPriceKeys(response)).toEqual([])`). A price key is reported as a
 * whole, its value is not searched.
 */
export function findPriceKeys(response: unknown, path = '$'): string[] {
  if (Array.isArray(response)) return response.flatMap((item, index) => findPriceKeys(item, `${path}[${index}]`));
  if (!isObject(response)) return [];
  return Object.entries(response).flatMap(([key, value]) =>
    wordsOf(key).some((word) => priceWords.has(word)) ? [`${path}.${key}`] : findPriceKeys(value, `${path}.${key}`),
  );
}
