import type { WorkshopDetails } from '@servisnik/domain/workshop';

// What the tests of the HTML of the printed forms share: made-up Údaje autoservisu, and a reader of the terms of a form.

/** An autoservis with every detail filled in. */
export const workshop: WorkshopDetails = {
  name: 'Autoservis Novák',
  street: 'Hlavná 1',
  city: 'Bratislava',
  postalCode: '811 01',
  ico: '12345678',
  dic: '2012345678',
  icDph: 'SK2012345678',
  vatPayerType: 'payer',
  iban: 'SK3112000000198742637541',
  phone: '+421 900 123 456',
  email: 'servis@novak.sk',
  commercialRegister: 'OR Okresného súdu Bratislava I, oddiel Sa, vložka 1234/B',
};

/** An autoservis that filled in its name and nothing else. */
export const onlyName: WorkshopDetails = {
  name: 'Autoservis Novák',
  street: null,
  city: null,
  postalCode: null,
  ico: null,
  dic: null,
  icDph: null,
  vatPayerType: 'nonPayer',
  iban: null,
  phone: null,
  email: null,
  commercialRegister: null,
};

/**
 * The text after the term `label` in a list of facts, as markup, or null when the document has no such term.
 * A grouped number keeps its digits together with a no-break space (as the app shows it), read here as a space.
 */
export const fact = (document: string, label: string) =>
  new RegExp(`<dt>${label}</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`).exec(document)?.[1]?.replace(/\p{Zs}/gu, ' ') ?? null;
