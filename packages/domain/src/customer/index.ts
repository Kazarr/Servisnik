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
  email?: string;
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
  email: string | null;
};

const text = (value: string | undefined) => value?.trim() || null;

/** A Zákazník ready to store, or why it is not one. Only a company has an IČO, DIČ and IČ DPH. */
export function parseCustomer(input: CustomerInput): { ok: true; customer: Customer } | { ok: false; errors: { name: 'required' } } {
  const name = input.name.trim();
  if (!name) return { ok: false, errors: { name: 'required' } };
  const isCompany = input.type === 'company';
  return {
    ok: true,
    customer: {
      type: input.type,
      name,
      ico: isCompany ? text(input.ico) : null,
      dic: isCompany ? text(input.dic) : null,
      icDph: isCompany ? text(input.icDph) : null,
      street: text(input.street),
      city: text(input.city),
      postalCode: text(input.postalCode),
      email: text(input.email),
    },
  };
}
