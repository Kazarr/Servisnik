'use server';

import type { RatesInput } from '@servisnik/domain/settings';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { saveRates } from '../../../dal/settings.ts';
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
