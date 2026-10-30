'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createRegistration, saveEdition, setRegistrationStatus, updateRegistration } from '../../../dal/joy-ride.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import {
  editionMessages,
  readEdition,
  readRegistration,
  registrationMessages,
  type EditionFormErrors,
  type EditionFormValues,
  type RegistrationFormErrors,
  type RegistrationFormValues,
} from './joy-ride-input.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export type EditionFormState = { values: EditionFormValues; errors: EditionFormErrors & { form?: string } } | null;

/** Server Action of the form of the Ročník; it checks the session itself, like every action, and goes back to the Jazda radosti once the Ročník is saved. */
export async function saveEditionAction(_state: EditionFormState, formData: FormData): Promise<EditionFormState> {
  const user = await currentUser();
  const values = readEdition(formData);

  const result = await orForbidden(saveEdition(user, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return { values, errors: editionMessages(result.errors) };
  revalidatePath('/jazda-radosti');
  redirect('/jazda-radosti');
}

export type RegistrationFormState = { values: RegistrationFormValues; errors: RegistrationFormErrors & { form?: string } } | null;

/** Server Action of the form that adds a Registrácia to the current Ročník; it checks the session itself, and goes back to the Jazda radosti once it is saved. */
export async function addRegistration(_state: RegistrationFormState, formData: FormData): Promise<RegistrationFormState> {
  const user = await currentUser();
  const values = readRegistration(formData);

  const result = await orForbidden(createRegistration(user, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return { values, errors: result.errors.edition ? { form: 'Najprv zadajte ročník Jazdy radosti' } : registrationMessages(result.errors) };
  revalidatePath('/jazda-radosti');
  redirect('/jazda-radosti');
}

/** Server Action of the form that edits the Registrácia whose id the form carries; it checks the session itself, and goes back to the Jazda radosti once it is saved. */
export async function editRegistration(_state: RegistrationFormState, formData: FormData): Promise<RegistrationFormState> {
  const user = await currentUser();
  const values = readRegistration(formData);

  const result = await orForbidden(updateRegistration(user, field(formData, 'id'), values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.registration === 'unknown') notFound();
    return { values, errors: registrationMessages(result.errors) };
  }
  revalidatePath('/jazda-radosti');
  redirect('/jazda-radosti');
}

export type DecisionState = { error: string } | null;

/** The Stavy the buttons of the list set: the decision of the admin. A Registrácia is Nová only until then. */
const decisions = ['approved', 'rejected'] as const;

/**
 * Server Action of the buttons that approve or reject a Registrácia in the list; it checks the session itself, like every action. A click
 * that names neither decision, or a Registrácia that is not there, is a page that does not exist.
 */
export async function decideRegistration(_state: DecisionState, formData: FormData): Promise<DecisionState> {
  const user = await currentUser();
  const status = decisions.find((known) => known === field(formData, 'status'));
  if (!status) notFound();

  const result = await orForbidden(setRegistrationStatus(user, field(formData, 'registrationId'), status));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok) notFound();
  revalidatePath('/jazda-radosti');
  return null;
}
