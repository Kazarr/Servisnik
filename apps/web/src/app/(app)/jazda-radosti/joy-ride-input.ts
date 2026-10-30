import type { EditionErrors, RegistrationErrors } from '@servisnik/domain/joy-ride';
import { formatMessages } from '../format-messages.ts';

// What the forms of the Jazda radosti send and what they are told back: the form of the Ročník and the form of a Registrácia, new or edited.
// Not a 'use server' file: those export nothing but Server Actions.

const text = (formData: FormData, name: string) => String(formData.get(name) ?? '');

const editionFields = ['name', 'date', 'place', 'registrationDeadline'] as const;
export type EditionFormValues = Record<(typeof editionFields)[number], string>;
export type EditionFormErrors = Partial<Record<(typeof editionFields)[number], string>>;

/** The Ročník from a form. */
export const readEdition = (formData: FormData) => Object.fromEntries(editionFields.map((name) => [name, text(formData, name)])) as EditionFormValues;

/** The message of each field the domain refused. */
export const editionMessages = ({ name, date, place, registrationDeadline }: EditionErrors): EditionFormErrors => ({
  name: name && 'Vyplňte názov ročníka',
  date: date && (date === 'required' ? 'Zadajte dátum konania' : 'Zadajte dátum konania ako platný dátum'),
  place: place && 'Vyplňte miesto konania',
  registrationDeadline: registrationDeadline && (registrationDeadline === 'required' ? 'Zadajte uzávierku registrácií, deň aj hodinu' : 'Zadajte uzávierku ako platný dátum a čas'),
});

const registrationFields = ['name', 'phone', 'email', 'make', 'model', 'licensePlate', 'category', 'note'] as const;
export type RegistrationFormValues = Record<(typeof registrationFields)[number], string>;
export type RegistrationFormErrors = Partial<Record<(typeof registrationFields)[number], string>>;

/** The Registrácia from a form. */
export const readRegistration = (formData: FormData) => Object.fromEntries(registrationFields.map((name) => [name, text(formData, name)])) as RegistrationFormValues;

/** The message of each field the domain refused. */
export const registrationMessages = ({ name, phone, email, make, model, category }: RegistrationErrors): RegistrationFormErrors => ({
  name: name && 'Vyplňte meno',
  phone: phone && 'Vyplňte telefón',
  email: email && (email === 'required' ? 'Vyplňte e-mail' : formatMessages.email),
  make: make && 'Vyplňte značku vozidla',
  model: model && 'Vyplňte model',
  category: category && 'Vyberte kategóriu',
});
