import { describe, expect, test } from 'vitest';
import type { HandoverProtocol } from '../src/dal/print-forms.ts';
import { handoverProtocolDocument } from '../src/print/handover-protocol.ts';
import { png } from './support/logo-files.ts';
import { fact, workshop } from './support/print-fixtures.ts';

// The HTML of the Odovzdávací protokol (GLOSSARY) over made-up data: the work and parts done, the kilometres, the day of
// the handover and the two signatures, and no price. How it looks on paper is the PDF test of the Route Handler.

const protocol: HandoverProtocol = {
  number: 'Z2026-0001',
  customer: { name: 'Ján Novák' },
  vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
  mileageKm: 123456,
  handoverMileageKm: null,
  items: [
    { kind: 'labour', code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h' },
    { kind: 'part', code: 'OL-5W30', name: 'Olej 5W-30', quantityHundredths: 425, unit: 'l' },
  ],
};

const print = (overrides: Partial<HandoverProtocol> = {}, logo: Parameters<typeof handoverProtocolDocument>[0]['logo'] = null, printedOn = '2026-10-28') =>
  handoverProtocolDocument({ protocol: { ...protocol, ...overrides }, workshop, logo, letterhead: 'white', printedOn });

/** The text of a cell: its markup without tags, a no-break space read as a space. */
const textOf = (cell: string) => cell.replace(/<[^>]*>/g, '').replace(/\p{Zs}/gu, ' ').trim();

/** The cells of every row of the part `part` of the table of items, as text. */
const cellsOf = (document: string, part: 'thead' | 'tbody') =>
  [...(new RegExp(`<${part}>([\\s\\S]*?)</${part}>`).exec(document)?.[1] ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => textOf(cell!)),
  );

describe('the header', () => {
  test('is the one of every form: the autoservis, the number of the Zákazka and the day of the print, under the name Odovzdávací protokol', () => {
    const document = print();

    expect(document).toContain('Autoservis Novák');
    expect(document).toContain('<h1>Odovzdávací protokol</h1>');
    expect(document).toContain('<title>Odovzdávací protokol Z2026-0001</title>');
    expect(fact(document, 'Číslo zákazky')).toBe('Z2026-0001');
    expect(fact(document, 'Dátum tlače')).toBe('28. 10. 2026');
    expect(document).toContain('Ján Novák');
    expect(fact(document, 'VIN')).toBe('WVWZZZ1JZ3W386752');
  });

  test('shows the logo when there is one and no image when there is none', () => {
    expect(print({}, { contentType: 'image/png', bytes: png })).toContain('<img class="logo" src="data:image/png;base64,');
    expect(print()).not.toContain('<img');
  });
});

describe('the content', () => {
  test('prints the kilometres at intake grouped by thousands, and the day of the handover, which is the day of the print', () => {
    const document = print({}, null, '2026-11-03');

    expect(fact(document, 'Kilometre pri príjme')).toBe('123 456 km');
    expect(fact(document, 'Dátum odovzdania')).toBe('3. 11. 2026');
  });

  test('prints the kilometres at handover next to those at intake, grouped by thousands', () => {
    const document = print({ handoverMileageKm: 123600 });

    expect(fact(document, 'Kilometre pri príjme')).toBe('123 456 km');
    expect(fact(document, 'Kilometre pri odovzdaní')).toBe('123 600 km');
    expect(document.indexOf('Kilometre pri príjme')).toBeLessThan(document.indexOf('Kilometre pri odovzdaní'));
    expect(document.indexOf('Kilometre pri odovzdaní')).toBeLessThan(document.indexOf('Dátum odovzdania'));
  });

  test('prints 0 km as the kilometres at handover of a vehicle that was handed over at 0, not as a blank to fill in', () => {
    expect(fact(print({ handoverMileageKm: 0 }), 'Kilometre pri odovzdaní')).toBe('0 km');
  });

  test('leaves a blank to write the kilometres at handover on, when the admin entered none', () => {
    const document = print();

    expect(fact(document, 'Kilometre pri odovzdaní')).toBe('________ km');
    expect(fact(document, 'Kilometre pri príjme')).toBe('123 456 km');
  });

  test('lists the work and the parts, one row each in the order given: the kind, the code, the name and the quantity with its unit', () => {
    const document = print();

    expect(cellsOf(document, 'thead')).toEqual([['Druh', 'Kód', 'Názov', 'Množstvo']]);
    expect(cellsOf(document, 'tbody')).toEqual([
      ['Práca', '', 'Výmena oleja', '1,5 h'],
      ['Diel', 'OL-5W30', 'Olej 5W-30', '4,25 l'],
    ]);
  });

  test('has its head in a thead before the body, which Chromium repeats on every page it breaks the table on', () => {
    expect(print()).toMatch(/<table[^>]*>\s*<thead>[\s\S]*<\/thead>\s*<tbody>/);
  });

  test('says so when the Zákazka has no work or part, and prints no table', () => {
    const document = print({ items: [] });

    expect(document).toContain('Zákazka nemá žiadne práce ani diely.');
    expect(document).not.toContain('<table');
  });

  test('ends with a line for the signature of the customer and one for the signature of the autoservis', () => {
    const lines = [...print().matchAll(/<p class="signature-line">([^<]*)<\/p>/g)].map(([, label]) => label);

    expect(lines).toEqual(['Podpis zákazníka', 'Podpis autoservisu']);
  });

  test('shows no price: no euro sign, VAT, amount, sum, discount or margin', () => {
    const document = print();
    const content = /<main>([\s\S]*)<\/main>/.exec(document)![1]!; // the style of the page has words of its own

    expect(document).not.toContain('€');
    expect(content).not.toMatch(/DPH|cena|suma|Spolu|zľav|marž|nákup/i);
    expect(document).not.toMatch(/DPH(?!:)/); // "IČ DPH:" in the header is the identifier of the autoservis, not VAT
  });

  test('shows no internal note', () => {
    expect(print()).not.toMatch(/poznámk/i);
  });
});

describe('the document', () => {
  test.each([
    ['the name of an item', { items: [{ ...protocol.items[0]!, name: '<script>alert(1)</script>' }] }],
    ['the code of an item', { items: [{ ...protocol.items[1]!, code: '"><img src=x onerror=alert(1)>' }] }],
    ['the unit of an item', { items: [{ ...protocol.items[0]!, unit: '<b>h</b>' }] }],
    ['the name of the customer', { customer: { name: '<b>Ján</b>' } }],
  ])('the text of %s is text: it cannot add a tag to the page', (_what, overrides) => {
    expect(print(overrides).match(/<script|<b>|<img [^>]*onerror/g)).toBeNull();
  });
});
