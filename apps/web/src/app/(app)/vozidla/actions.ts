'use server';

import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createVehicle, deleteVehicle, transferOwnership, updateVehicle, type ExistingVehicle, type VehicleSaveErrors } from '../../../dal/vehicles.ts';
import type { DeleteState } from '../delete-form.tsx';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { readVehicle, vehicleMessages, type VehicleFormErrors, type VehicleFormValues } from './vehicle-input.ts';

export type VehicleFormState = {
  values: VehicleFormValues;
  errors: VehicleFormErrors & { form?: string };
  /** The Vozidlo that already has the VIN the form was sent with; the form shows whose it is and links to it. */
  existing?: ExistingVehicle;
} | null;

function refused(values: VehicleFormValues, result: { errors: VehicleSaveErrors; existing?: ExistingVehicle }): VehicleFormState {
  return { values, errors: vehicleMessages(result.errors), existing: result.existing };
}

/**
 * Server Action of the form for a new vehicle. It checks the session itself: the proxy only sees a
 * cookie, and the action is a public endpoint. The Majiteľ is the Zákazník the form was opened for;
 * once the fields parse and the VIN is free, one that does not exist is a page that does not exist.
 */
export async function addVehicle(_state: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const user = await currentUser();
  const ownerId = String(formData.get('ownerId') ?? '');
  const values = readVehicle(formData);

  const result = await orForbidden(createVehicle(user, { ownerId, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.owner) notFound();
    return refused(values, result);
  }
  redirect(`/zakaznici/${ownerId}`);
}

/** Server Action of the form that edits the vehicle whose id the form carries; same checks as addVehicle. */
export async function editVehicle(_state: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const user = await currentUser();
  const id = String(formData.get('id') ?? '');
  const values = readVehicle(formData);

  const result = await orForbidden(updateVehicle(user, id, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.vehicle) notFound();
    return refused(values, result);
  }
  redirect(`/vozidla/${id}`);
}

export type TransferFormState = { error: string } | null;

const transferMessages = {
  same: 'Vozidlo už patrí tomuto zákazníkovi',
  changed: 'Majiteľ vozidla sa medzitým zmenil, nič sa neprepísalo. Otvorte detail vozidla a skúste to znova.',
};

/**
 * Server Action of "Potvrdiť prepis". It checks the session itself, like every action, and sends the
 * Majiteľ the page showed along with the new one, so that a Prepis confirmed after another one is
 * refused (`transferOwnership`), unless the Vozidlo has come back to that Majiteľ. A Vozidlo or a Zákazník that does not exist is a page that does not.
 */
export async function transferVehicle(_state: TransferFormState, formData: FormData): Promise<TransferFormState> {
  const user = await currentUser();
  const id = String(formData.get('vehicleId') ?? '');
  const owners = { fromOwnerId: String(formData.get('fromOwnerId') ?? ''), toOwnerId: String(formData.get('toOwnerId') ?? '') };

  const result = await orForbidden(transferOwnership(user, id, owners));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok) {
    if ('vehicle' in result.errors || result.errors.owner === 'unknown') notFound();
    return { error: transferMessages[result.errors.owner] };
  }
  redirect(`/vozidla/${id}`);
}

/**
 * Server Action of "Potvrdiť zmazanie" on a vehicle's detail; it checks the session and the Rola itself,
 * like every action. A vehicle that got a Zákazka after the page was opened is not deleted: the
 * database refuses, and the page says so.
 */
export async function removeVehicle(_state: DeleteState, formData: FormData): Promise<DeleteState> {
  const user = await currentUser();

  const result = await orForbidden(deleteVehicle(user, String(formData.get('id') ?? '')));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok) {
    if (result.error === 'unknown') notFound();
    return { error: 'Vozidlo má zákazku, preto ho nemožno zmazať' };
  }
  redirect('/vozidla');
}
