// Customer area (GLOSSARY: Zákazníci). Pure rules: no framework, database or network.

/** Osoba is a private person, Firma has an IČO (and may be a self-employed one). */
export const customerTypes = ['person', 'company'] as const;
export type CustomerType = (typeof customerTypes)[number];

export type CustomerInput = {
  type: CustomerType;
  /** A company's name, or a person's first name and surname in one field. */
  name: string;
  ico?: string;
  dic?: string;
  icDph?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  note?: string;
};
export type Customer = {
  type: CustomerType;
  name: string;
  ico: string | null;
  dic: string | null;
  icDph: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
};
export type CustomerErrors = {
  name?: 'required';
  ico?: 'required' | 'format';
  dic?: 'format';
  icDph?: 'format';
  postalCode?: 'format';
  email?: 'format';
};

const blankToNull = (value: string | undefined) => value?.trim() || null;

// The formats are only shapes: nothing is looked up in a register, and the IČO check digit is not checked.
const formats = {
  ico: /^\d{8}$/,
  dic: /^\d{10}$/,
  icDph: /^[A-Z]{2}[A-Za-z0-9]{2,12}$/, // a country code, then 2 to 12 letters or digits
  postalCode: /^\d{5}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

/** The fields that have a format: the identification and the contact of a Zákazník, and of the Autoservis. */
export type FormatField = keyof typeof formats;

/**
 * The fields of `values` whose value is in the wrong shape. A field that is missing, null or blank
 * has no value to be wrong; trimming is the caller's, so is taking the spaces out of a PSČ (normalizePostalCode).
 */
export function formatErrors(values: Partial<Record<FormatField, string | null | undefined>>): Partial<Record<FormatField, 'format'>> {
  const errors: Partial<Record<FormatField, 'format'>> = {};
  for (const field of Object.keys(formats) as FormatField[]) {
    const value = values[field];
    if (value?.trim() && !formats[field].test(value)) errors[field] = 'format';
  }
  return errors;
}

/** A PSČ is stored without a space: "811 01" is "81101". */
export const normalizePostalCode = (typed: string) => typed.replace(/\s/g, '');

/** Whether `value` has the shape of an e-mail, the one rule of every e-mail in Servisník (the access area asks it for a Používateľ). */
export const isEmail = (value: string) => formats.email.test(value);

/**
 * A Zákazník ready to store, or every reason it is not one. A company has an IČO (required), DIČ and
 * IČ DPH; a person has none of them, so they are dropped before they are checked. A PSČ is stored
 * without a space.
 */
export function parseCustomer(input: CustomerInput): { ok: true; customer: Customer } | { ok: false; errors: CustomerErrors } {
  const isCompany = input.type === 'company';
  const customer: Customer = {
    type: input.type,
    name: input.name.trim(),
    ico: isCompany ? blankToNull(input.ico) : null,
    dic: isCompany ? blankToNull(input.dic) : null,
    icDph: isCompany ? blankToNull(input.icDph) : null,
    street: blankToNull(input.street),
    city: blankToNull(input.city),
    postalCode: normalizePostalCode(input.postalCode ?? '') || null,
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    note: blankToNull(input.note),
  };

  const errors: CustomerErrors = formatErrors(customer);
  if (!customer.name) errors.name = 'required';
  if (isCompany && !customer.ico) errors.ico = 'required';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, customer };
}

// Hľadanie zákazníkov: one field finds a Zákazník by part of the name, IČO, e-mail or phone. The same
// normalization is applied to what is stored and to what is typed, so PostgreSQL needs no `unaccent`.

/** Lower case, no diacritics, single spaces: "Ján  Novák" is "jan novak". */
export const normalizeText = (typed: string) =>
  typed.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();

/** Digits only, without a leading 00421, 421 or 0: "+421 905 123 456" and "0905 123 456" are both "905123456". */
export const normalizePhone = (typed: string) => typed.replace(/\D/g, '').replace(/^(?:00421|421|0)/, '');

export type CustomerSearch = {
  /** Looked for in the name and the e-mail. */
  text: string;
  /** Looked for in the IČO, which is digits only, so spaces typed between its groups are dropped. */
  ico: string;
  /** Looked for in the phone; null when what was typed is not a phone number, so that "Ján 2" does not find every phone with a 2. */
  phone: string | null;
};

/** What to look for when `typed` is typed into the search field; blank text looks for nothing. */
export function parseCustomerSearch(typed: string): CustomerSearch {
  const text = normalizeText(typed);
  const phone = /\p{L}/u.test(typed) ? '' : normalizePhone(typed);
  return { text, ico: text.replaceAll(' ', ''), phone: phone || null };
}

/** The normalized name, e-mail and phone of a Zákazník, stored beside them to be searched. */
export function searchKeys(customer: Pick<Customer, 'name' | 'email' | 'phone'>) {
  return {
    searchName: normalizeText(customer.name),
    searchEmail: normalizeText(customer.email ?? ''),
    searchPhone: normalizePhone(customer.phone ?? ''),
  };
}
