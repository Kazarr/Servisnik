'use server';

import type { WorkshopDetailsInput } from '@servisnik/domain/workshop';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { saveWorkshopDetails } from '../../../dal/workshop.ts';
import { formatMessages } from '../format-messages.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';

export type WorkshopFormState = {
  values: WorkshopDetailsInput;
  errors: Partial<Record<keyof WorkshopDetailsInput | 'form', string>>;
  /** The details were saved; `values` are then the saved ones, as the domain tidied them up. */
  saved?: true;
} | null;

const messages = {
  name: 'Vyplňte názov autoservisu',
  icDph: { format: formatMessages.icDph, required: 'Platiteľ DPH musí mať IČ DPH' },
  iban: 'IBAN nie je platný: začína kódom krajiny a dvoma číslicami a jeho kontrolný súčet musí sedieť, skontrolujte preklep',
  vatPayerType: 'Vyberte, či je autoservis platiteľ DPH, neplatiteľ alebo registrovaný podľa §7',
};

/** Server Action of the form for Údaje autoservisu; like every action it checks the session and the Rola itself, in the DAL. */
export async function saveWorkshopDetailsAction(_state: WorkshopFormState, formData: FormData): Promise<WorkshopFormState> {
  const user = await currentUser();
  const text = (name: keyof WorkshopDetailsInput) => String(formData.get(name) ?? '');
  const values: WorkshopDetailsInput = {
    name: text('name'),
    street: text('street'),
    city: text('city'),
    postalCode: text('postalCode'),
    ico: text('ico'),
    dic: text('dic'),
    icDph: text('icDph'),
    vatPayerType: text('vatPayerType'),
    iban: text('iban'),
    phone: text('phone'),
    email: text('email'),
    commercialRegister: text('commercialRegister'),
  };

  const result = await orForbidden(saveWorkshopDetails(user, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { name, ico, dic, icDph, postalCode, email, iban, vatPayerType } = result.errors;
    return {
      values,
      errors: {
        name: name && messages.name,
        ico: ico && formatMessages.ico,
        dic: dic && formatMessages.dic,
        icDph: icDph && messages.icDph[icDph],
        postalCode: postalCode && formatMessages.postalCode,
        email: email && formatMessages.email,
        iban: iban && messages.iban,
        vatPayerType: vatPayerType && messages.vatPayerType,
      },
    };
  }
  revalidatePath('/nastavenia');
  // What is not filled in is null in the details and an empty field in the form; the keys are the same.
  const saved = Object.fromEntries(Object.entries(result.details).map(([name, value]) => [name, value ?? ''])) as WorkshopDetailsInput;
  return { values: saved, errors: {}, saved: true };
}
