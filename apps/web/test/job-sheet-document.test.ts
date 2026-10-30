import type { Letterhead } from '@servisnik/domain/print';
import type { WorkshopDetails } from '@servisnik/domain/workshop';
import { describe, expect, test } from 'vitest';
import type { JobSheet } from '../src/dal/job-sheet.ts';
import { jobSheetDocument } from '../src/print/job-sheet.ts';
import { jpeg, png } from './support/logo-files.ts';
import { fact, onlyName, workshop } from './support/print-fixtures.ts';

// The HTML of the Zákazkový list (GLOSSARY) over made-up data: what it says, what it leaves out and that the text
// of a customer can only be text. How it looks on paper is the PDF test of the Route Handler.

const sheet: JobSheet = {
  number: 'Z2026-0001',
  customer: { name: 'Ján Novák' },
  vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
  mileageKm: 123456,
  deadline: '2026-12-01',
  customerRequest: 'Výmena oleja\nKontrola bŕzd',
};

const print = (overrides: { sheet?: JobSheet; workshop?: WorkshopDetails; logo?: Parameters<typeof jobSheetDocument>[0]['logo']; letterhead?: Letterhead } = {}) =>
  jobSheetDocument({ sheet, workshop, logo: null, letterhead: 'white', printedOn: '2026-10-28', ...overrides });

/** The document as its text reads, a no-break space as a space. */
const read = (document: string) => document.replace(/\p{Zs}/gu, ' ');

describe('the header', () => {
  test('carries the name, address, identifiers and contacts of the autoservis, the number of the Zákazka and the day of the print', () => {
    const document = read(print());

    for (const line of [
      'Autoservis Novák',
      'Hlavná 1, 811 01 Bratislava',
      'IČO: 12345678',
      'DIČ: 2012345678',
      'IČ DPH: SK2012345678',
      'Tel.: +421 900 123 456',
      'E-mail: servis@novak.sk',
      'IBAN: SK3112000000198742637541',
      'OR Okresného súdu Bratislava I, oddiel Sa, vložka 1234/B',
    ])
      expect(document, line).toContain(line);
    expect(fact(document, 'Číslo zákazky')).toBe('Z2026-0001');
    expect(fact(document, 'Dátum tlače')).toBe('28. 10. 2026');
    expect(document).toContain('<h1>Zákazkový list</h1>');
    expect(document).toContain('<title>Zákazkový list Z2026-0001</title>');
  });

  test('prints only what the autoservis filled in: a detail left out leaves no label behind', () => {
    const document = read(print({ workshop: onlyName }));

    expect(document).toContain('Autoservis Novák');
    for (const label of ['IČO', 'DIČ', 'IČ DPH', 'Tel.', 'E-mail', 'IBAN']) expect(document, label).not.toContain(label);
  });

  // A column of the header can be narrower than a line of details; it then wraps between details (at " · "), never inside one (ticket #148).
  test('keeps each labelled detail in one piece with no-break spaces: the label, its value and the two words of the IČ DPH', () => {
    const document = print();

    for (const detail of [
      'IČO:\u00a012345678',
      'DIČ:\u00a02012345678',
      'IČ\u00a0DPH:\u00a0SK2012345678',
      'Tel.:\u00a0+421\u00a0900\u00a0123\u00a0456',
      'E-mail:\u00a0servis@novak.sk',
      'IBAN:\u00a0SK3112000000198742637541',
    ])
      expect(document, detail).toContain(detail);
  });

  test('puts the street and the town together as far as they are known', () => {
    expect(print({ workshop: { ...onlyName, street: 'Hlavná 1' } })).toContain('Hlavná 1');
    expect(print({ workshop: { ...onlyName, city: 'Bratislava', postalCode: '811 01' } })).toContain('811 01 Bratislava');
    expect(print({ workshop: { ...onlyName, street: 'Hlavná 1', city: 'Bratislava' } })).toContain('Hlavná 1, Bratislava');
  });

  test('shows the logo as an image of the page itself, of the type it has, and shows none when there is none', () => {
    expect(print({ logo: { contentType: 'image/png', bytes: png } })).toContain(`<img class="logo" src="data:image/png;base64,${Buffer.from(png).toString('base64')}"`);
    expect(print({ logo: { contentType: 'image/jpeg', bytes: jpeg } })).toContain('src="data:image/jpeg;base64,');
    expect(print({ logo: null })).not.toContain('<img');
  });

  // How the two Hlavičky look on paper is the PDF test of letterhead.test.ts; here is only that the header says which one it is.
  test('is the header of the Hlavička the admin picked, with the logo in either', () => {
    const logo = { contentType: 'image/png', bytes: png } as const;

    expect(print({ letterhead: 'white', logo })).toContain('<header class="letterhead letterhead-white">');
    expect(print({ letterhead: 'blackBar', logo })).toContain('<header class="letterhead letterhead-black-bar">');
    for (const letterhead of ['white', 'blackBar'] as const) expect(print({ letterhead, logo }), letterhead).toContain('<img class="logo" src="data:image/png;base64,');
  });
});

describe('the content', () => {
  test('names the customer and the vehicle: make and model, VIN and ŠPZ', () => {
    const document = print();

    expect(document).toContain('Ján Novák');
    expect(document).toContain('Volkswagen Golf');
    expect(fact(document, 'VIN')).toBe('WVWZZZ1JZ3W386752');
    expect(fact(document, 'ŠPZ')).toBe('BA123AB');
  });

  test('prints a dash for a vehicle that has no ŠPZ', () => {
    expect(fact(print({ sheet: { ...sheet, vehicle: { ...sheet.vehicle, licensePlate: null } } }), 'ŠPZ')).toBe('—');
  });

  test('prints the kilometres at intake grouped by thousands, and the request of the customer as he gave it', () => {
    const document = print();

    expect(fact(document, 'Kilometre pri príjme')).toBe('123 456 km');
    expect(document).toContain('Požiadavka zákazníka');
    expect(document).toContain('Výmena oleja\nKontrola bŕzd');
  });

  test('prints the Termín of the Zákazka as a day, and a blank line to write it on when it has none', () => {
    expect(fact(print(), 'Termín')).toBe('1. 12. 2026');
    expect(fact(print({ sheet: { ...sheet, deadline: null } }), 'Termín')).toBe('<span class="write-line"></span>');
  });

  test('ends with the line for the signature of the customer', () => {
    expect(print()).toMatch(/<p class="signature-line">Podpis zákazníka<\/p>/);
  });

  test('shows no price: no euro sign, VAT or amount', () => {
    const document = print();

    expect(document).not.toContain('€');
    expect(document).not.toMatch(/DPH(?!:)|cena|suma|Spolu/i); // "IČ DPH:" is the autoservis's identifier, not VAT
  });
});

describe('the document', () => {
  test('is a Slovak page in UTF-8 that loads and runs nothing from anywhere: no script, no outside address, an image only from itself', () => {
    const document = print({ logo: { contentType: 'image/png', bytes: png } });

    expect(document).toMatch(/^<!doctype html><html lang="sk">/);
    expect(document).toContain('<meta charset="utf-8">');
    expect(document).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`);
    expect(document).not.toMatch(/<script|<link|https?:\/\//i);
  });

  test.each([
    ['the name of the autoservis', { workshop: { ...workshop, name: '<script>x</script> & Syn' } }],
    ['the commercial register', { workshop: { ...workshop, commercialRegister: '<img src=x onerror=alert(1)>' } }],
    ['the name of the customer', { sheet: { ...sheet, customer: { name: '<b>Ján</b>' } } }],
    ['the request of the customer', { sheet: { ...sheet, customerRequest: '<script>alert(1)</script>' } }],
    ['the make of the vehicle', { sheet: { ...sheet, vehicle: { ...sheet.vehicle, make: '"><i>' } } }],
  ])('the text of %s is text: it cannot add a tag to the page', (_what, overrides) => {
    const document = print(overrides);

    expect(document.match(/<script|<b>|<i>|<img [^>]*onerror/g)).toBeNull();
  });
});
