'use server';

import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createVehicle } from '../../../dal/vehicles.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';

export type VehicleFormState = {
  values: Record<'vin' | 'licensePlate' | 'make' | 'model', string>;
  errors: { vin?: string; make?: string; model?: string; form?: string };
} | null;

const vinMessages = {
  length: 'VIN musí mať presne 17 znakov',
  characters: 'VIN smie obsahovať len písmená A–Z a číslice 0–9, bez I, O a Q',
  taken: 'Vozidlo s týmto VIN už existuje',
};

/**
 * Server Action of the vehicle form. It checks the session itself: the proxy only sees a cookie, and
 * the action is a public endpoint. The Majiteľ is the Zákazník the form was opened from; once the
 * fields parse and the VIN is free, one that does not exist is a page that does not exist.
 */
export async function addVehicle(_state: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const user = await currentUser();
  const field = (name: string) => String(formData.get(name) ?? '');
  const ownerId = field('ownerId');
  const values = { vin: field('vin'), licensePlate: field('licensePlate'), make: field('make'), model: field('model') };

  const result = await orForbidden(createVehicle(user, { ownerId, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { vin, make, model, owner } = result.errors;
    if (owner) notFound();
    return {
      values,
      errors: {
        vin: vin && vinMessages[vin],
        make: make && 'Vyplňte značku',
        model: model && 'Vyplňte model',
      },
    };
  }
  redirect(`/zakaznici/${ownerId}`);
}
