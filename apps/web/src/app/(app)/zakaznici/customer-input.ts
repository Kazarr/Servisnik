import type { CustomerSaveErrors } from '../../../dal/customers.ts';
import { formatMessages } from '../format-messages.ts';

// What a form of a Zákazník sends and what it is told back: shared by the form of a new Zákazník, the one that
// edits him, and the intake that saves a new Zákazník with his Vozidlo and Zákazka (zakazky/actions.ts).
// Not a 'use server' file: those export nothing but Server Actions.

export type CustomerFormValues = Record<'name' | 'ico' | 'dic' | 'icDph' | 'street' | 'city' | 'postalCode' | 'phone' | 'email' | 'note', string>;

export type CustomerFormErrors = Partial<Record<keyof CustomerFormValues, string>>;

/** The prefix of the names of the fields of a Zákazník in the form of an intake, where the fields of a Vozidlo are in the same form. */
export const intakeCustomerPrefix = 'customer.';

const messages = {
  name: 'Vyplňte názov, pri osobe meno a priezvisko',
  ico: {
    required: 'Vyplňte IČO firmy',
    format: formatMessages.ico,
    taken: 'Firma s týmto IČO už existuje',
  },
  dic: formatMessages.dic,
  icDph: formatMessages.icDph,
  postalCode: formatMessages.postalCode,
  email: formatMessages.email,
};

/** The type and the fields of a Zákazník from a form whose field names start with `prefix`. */
export function readCustomer(formData: FormData, prefix = '') {
  const type = formData.get(`${prefix}type`) === 'company' ? 'company' : 'person';
  const text = (name: string) => String(formData.get(`${prefix}${name}`) ?? '');
  const values: CustomerFormValues = {
    name: text('name'),
    ico: text('ico'),
    dic: text('dic'),
    icDph: text('icDph'),
    street: text('street'),
    city: text('city'),
    postalCode: text('postalCode'),
    phone: text('phone'),
    email: text('email'),
    note: text('note'),
  };
  return { type, values } as const;
}

/** The message of each field the domain or the database refused. */
export function customerMessages({ name, ico, dic, icDph, postalCode, email }: CustomerSaveErrors): CustomerFormErrors {
  return {
    name: name && messages.name,
    ico: ico && messages.ico[ico],
    dic: dic && messages.dic,
    icDph: icDph && messages.icDph,
    postalCode: postalCode && messages.postalCode,
    email: email && messages.email,
  };
}
