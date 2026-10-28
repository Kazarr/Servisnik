import type { CustomerSaveErrors } from '../../../dal/customers.ts';

// What a form of a Zákazník sends and what it is told back: shared by the form of a new Zákazník, the one that
// edits him, and the intake that saves a new Zákazník with his Vozidlo and Zákazka (zakazky/actions.ts).
// Not a 'use server' file: those export nothing but Server Actions.

export type CustomerFormValues = Record<'name' | 'ico' | 'dic' | 'icDph' | 'street' | 'city' | 'postalCode' | 'phone' | 'email' | 'note', string>;

export type CustomerFormErrors = Partial<Record<keyof CustomerFormValues, string>>;

const messages = {
  name: 'Vyplňte názov, pri osobe meno a priezvisko',
  ico: {
    required: 'Vyplňte IČO firmy',
    format: 'IČO má mať presne 8 číslic',
    taken: 'Firma s týmto IČO už existuje',
  },
  dic: 'DIČ má mať presne 10 číslic',
  icDph: 'IČ DPH začína kódom krajiny (2 veľké písmená) a pokračuje 2 až 12 písmenami alebo číslicami, napríklad SK2020123456',
  postalCode: 'PSČ má mať presne 5 číslic',
  email: 'Zadajte e-mail v tvare meno@domena.sk',
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
