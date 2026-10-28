'use server';

import type { RatesInput } from '@servisnik/domain/settings';
import type { WorkshopDetailsInput } from '@servisnik/domain/workshop';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { saveRates } from '../../../dal/settings.ts';
import { saveWorkshopDetails } from '../../../dal/workshop.ts';
import { formatMessages } from '../format-messages.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { ratesToFields } from './rates-fields.ts';

export type RatesFormState = {
  values: RatesInput;
  errors: Partial<Record<keyof RatesInput | 'form', string>>;
  /** The rates were saved; `values` are then the saved ones. */
  saved?: true;
} | null;

const messages = {
  vatRates: {
    required: 'Zadajte aspoň jednu sadzbu DPH',
    invalid: 'Každá sadzba DPH je celé číslo od 0 do 100, jedna na riadok',
    duplicate: 'Sadzba DPH je v zozname dvakrát',
  },
  defaultVatRate: {
    invalid: 'Predvolená sadzba DPH je celé číslo od 0 do 100',
    'not-in-list': 'Predvolená sadzba musí byť v zozname. Ak ju chcete odobrať, vyberte najprv inú predvolenú.',
  },
  hourlyRate: 'Hodinová sadzba je suma v eurách, 0 alebo viac, najviac na 2 desatinné miesta, alebo prázdna',
  markup: 'Prirážka je celé percento, 0 alebo viac',
};

const field = (formData: FormData, name: keyof RatesInput) => String(formData.get(name) ?? '');

/**
 * Server Action of the form for the rates; it checks the session and the Rola itself, in the DAL, like
 * every action. The page shows the saved rates again, so a refused save keeps what was typed.
 */
export async function saveRatesAction(_state: RatesFormState, formData: FormData): Promise<RatesFormState> {
  const user = await currentUser();
  const values: RatesInput = {
    vatRates: field(formData, 'vatRates'),
    defaultVatRate: field(formData, 'defaultVatRate'),
    hourlyRate: field(formData, 'hourlyRate'),
    markup: field(formData, 'markup'),
  };

  const result = await orForbidden(saveRates(user, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { vatRates, defaultVatRate, hourlyRate, markup } = result.errors;
    return {
      values,
      errors: {
        vatRates: vatRates && messages.vatRates[vatRates],
        defaultVatRate: defaultVatRate && messages.defaultVatRate[defaultVatRate],
        hourlyRate: hourlyRate && messages.hourlyRate,
        markup: markup && messages.markup,
      },
    };
  }
  revalidatePath('/nastavenia');
  return { values: ratesToFields(result.rates), errors: {}, saved: true };
}

export type WorkshopFormState = {
  values: WorkshopDetailsInput;
  errors: Partial<Record<keyof WorkshopDetailsInput | 'form', string>>;
  /** The details were saved; `values` are then the saved ones, as the domain tidied them up. */
  saved?: true;
} | null;

const workshopMessages = {
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
        name: name && workshopMessages.name,
        ico: ico && formatMessages.ico,
        dic: dic && formatMessages.dic,
        icDph: icDph && workshopMessages.icDph[icDph],
        postalCode: postalCode && formatMessages.postalCode,
        email: email && formatMessages.email,
        iban: iban && workshopMessages.iban,
        vatPayerType: vatPayerType && workshopMessages.vatPayerType,
      },
    };
  }
  revalidatePath('/nastavenia');
  // What is not filled in is null in the details and an empty field in the form; the keys are the same.
  const saved = Object.fromEntries(Object.entries(result.details).map(([name, value]) => [name, value ?? ''])) as WorkshopDetailsInput;
  return { values: saved, errors: {}, saved: true };
}
