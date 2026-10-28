'use server';

import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createVehicle, updateVehicle, type ExistingVehicle, type VehicleSaveErrors } from '../../../dal/vehicles.ts';
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
