// Customer area (GLOSSARY: Zákazníci a vozidlá). Pure rules: no framework, database or network.

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
    postalCode: blankToNull(input.postalCode)?.replace(/\s/g, '') ?? null,
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    note: blankToNull(input.note),
  };

  const errors: CustomerErrors = {};
  if (!customer.name) errors.name = 'required';
  if (isCompany && !customer.ico) errors.ico = 'required';
  for (const field of ['ico', 'dic', 'icDph', 'postalCode', 'email'] as const) {
    const value = customer[field];
    if (value && !formats[field].test(value)) errors[field] = 'format';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, customer };
}
