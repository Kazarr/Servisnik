import { describe, expect, test } from 'vitest';
import type { Quote } from '../src/dal/print-forms.ts';
import { quoteDocument } from '../src/print/quote.ts';
import { png } from './support/logo-files.ts';
import { fact, workshop } from './support/print-fixtures.ts';

// The HTML of the Cenová ponuka (GLOSSARY) over made-up data: the items with their prices, the sums, what it leaves out
// and that the text of a customer can only be text. How it looks on paper is the PDF test of the Route Handler.

const quote: Quote = {
  number: 'Z2026-0001',
  customer: { name: 'Ján Novák' },
  vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
  items: [
    { code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h', salePriceCents: 4000, vatRate: 23, amounts: { net: 6000, vat: 1380, gross: 7380 } },
    { code: 'OF-1', name: 'Olejový filter', quantityHundredths: 300, unit: 'ks', salePriceCents: 999, vatRate: 19, amounts: { net: 2997, vat: 569, gross: 3566 } },
  ],
  totals: { net: 8997, vat: 1949, gross: 10946 },
};

const print = (overrides: Partial<Quote> = {}, logo: Parameters<typeof quoteDocument>[0]['logo'] = null) =>
  quoteDocument({ quote: { ...quote, ...overrides }, workshop, logo, printedOn: '2026-10-28' });

/** The text of a cell: its markup without tags, a no-break space read as a space. */
const textOf = (cell: string) => cell.replace(/<[^>]*>/g, '').replace(/\p{Zs}/gu, ' ').trim();

/** The cells of every row of the part `part` of the table of items, as text. */
const cellsOf = (document: string, part: 'thead' | 'tbody') =>
  [...(new RegExp(`<${part}>([\\s\\S]*?)</${part}>`).exec(document)?.[1] ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => textOf(cell!)),
  );

describe('the header', () => {
  test('is the one of every form: the autoservis, the number of the Zákazka and the day of the print, under the name Cenová ponuka', () => {
    const document = print();

    expect(document).toContain('Autoservis Novák');
    expect(document).toContain('<h1>Cenová ponuka</h1>');
    expect(document).toContain('<title>Cenová ponuka Z2026-0001</title>');
    expect(fact(document, 'Číslo zákazky')).toBe('Z2026-0001'); // it has no number of its own
    expect(fact(document, 'Dátum tlače')).toBe('28. 10. 2026');
    expect(document).toContain('Ján Novák');
    expect(fact(document, 'VIN')).toBe('WVWZZZ1JZ3W386752');
  });

  test('shows the logo when there is one and no image when there is none', () => {
    expect(print({}, { contentType: 'image/png', bytes: png })).toContain('<img class="logo" src="data:image/png;base64,');
    expect(print()).not.toContain('<img');
  });
});

describe('the items', () => {
  test('have a column for the name, the quantity, the price per unit without VAT, the VAT rate and the amount without and with VAT', () => {
    expect(cellsOf(print(), 'thead')).toEqual([['Názov', 'Množstvo', 'Cena za jednotku bez DPH', 'Sadzba DPH', 'Suma bez DPH', 'Suma s DPH']]);
  });

  test('are one row each, in the order given: the code before the name, the quantity with its unit, the prices in euros and the VAT rate in percent', () => {
    expect(cellsOf(print(), 'tbody')).toEqual([
      ['Výmena oleja', '1,5 h', '40,00 €', '23 %', '60,00 €', '73,80 €'],
      ['OF-1 Olejový filter', '3 ks', '9,99 €', '19 %', '29,97 €', '35,66 €'],
    ]);
  });

  test('print the amounts they were given and add nothing up: the sums of the domain are the numbers on the form', () => {
    const odd = { ...quote.items[0]!, amounts: { net: 1, vat: 2, gross: 3 } };

    expect(cellsOf(print({ items: [odd] }), 'tbody')).toEqual([['Výmena oleja', '1,5 h', '40,00 €', '23 %', '0,01 €', '0,03 €']]);
  });

  test('have their head in a thead before the body, which Chromium repeats on every page it breaks the table on', () => {
    expect(print()).toMatch(/<table[^>]*>\s*<thead>[\s\S]*<\/thead>\s*<tbody>/);
  });

  test('say so when the Zákazka has none, and print no table', () => {
    const document = print({ items: [], totals: { net: 0, vat: 0, gross: 0 } });

    expect(document).toContain('Zákazka zatiaľ nemá žiadne položky.');
    expect(document).not.toContain('<table');
  });
});

describe('the sums', () => {
  test('are the ones of the Zákazka as given, without VAT, the VAT and with VAT', () => {
    const document = print({ totals: { net: 123456, vat: 28395, gross: 151851 } });

    expect(fact(document, 'Spolu bez DPH')).toBe('1 234,56 €');
    expect(fact(document, 'DPH')).toBe('283,95 €');
    expect(fact(document, 'Spolu s DPH')).toBe('1 518,51 €');
  });

  test('are printed for a Zákazka without items too, as nothing', () => {
    expect(fact(print({ items: [], totals: { net: 0, vat: 0, gross: 0 } }), 'Spolu s DPH')).toBe('0,00 €');
  });
});

describe('what the customer does not get', () => {
  test('is no purchase price, no markup and no margin', () => {
    expect(print()).not.toMatch(/nákup|marž|prirážk|zisk/i);
  });

  test('is no internal note, no kilometres and no signature line', () => {
    const content = /<main>([\s\S]*)<\/main>/.exec(print())![1]!; // the style of the page names the kilometres too

    expect(content).not.toMatch(/poznámk|kilometre|Podpis/i);
  });
});

describe('the document', () => {
  test.each([
    ['the name of an item', { items: [{ ...quote.items[0]!, name: '<script>alert(1)</script>' }] }],
    ['the code of an item', { items: [{ ...quote.items[1]!, code: '"><img src=x onerror=alert(1)>' }] }],
    ['the unit of an item', { items: [{ ...quote.items[0]!, unit: '<b>h</b>' }] }],
    ['the name of the customer', { customer: { name: '<b>Ján</b>' } }],
  ])('the text of %s is text: it cannot add a tag to the page', (_what, overrides) => {
    expect(print(overrides).match(/<script|<b>|<img [^>]*onerror/g)).toBeNull();
  });
});
