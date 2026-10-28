'use server';

import { firstVehicleYear, lastVehicleYear, maxMileageKm } from '@servisnik/domain/vehicle';
import { localYear } from '@servisnik/domain/work-order';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createVehicle, updateVehicle, type VehicleSaveErrors } from '../../../dal/vehicles.ts';
import { formatWhole } from '../../../format.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';

const fields = ['vin', 'licensePlate', 'make', 'model', 'year', 'fuel', 'mileageKm', 'note'] as const;
type Field = (typeof fields)[number];

export type VehicleFormState = {
  values: Record<Field, string>;
  errors: Partial<Record<Field | 'form', string>>;
  /** The Vozidlo that already has the VIN the form was sent with; the form shows whose it is and links to it. */
  existing?: { id: string; make: string; model: string; owner: { id: string; name: string } };
} | null;

const vinMessages = {
  length: 'VIN musí mať presne 17 znakov',
  characters: 'VIN smie obsahovať len písmená A–Z a číslice 0–9',
  confusable: 'VIN nemá písmená I, O ani Q: namiesto I patrí 1, namiesto O a Q patrí 0',
  taken: 'Vozidlo s týmto VIN už existuje',
};

function read(formData: FormData) {
  return Object.fromEntries(fields.map((name) => [name, String(formData.get(name) ?? '')])) as Record<Field, string>;
}

function refused(values: Record<Field, string>, result: { errors: VehicleSaveErrors; existing?: NonNullable<VehicleFormState>['existing'] }): VehicleFormState {
  const { vin, make, model, year, fuel, mileageKm } = result.errors;
  return {
    values,
    errors: {
      vin: vin && vinMessages[vin],
      make: make && 'Vyplňte značku',
      model: model && 'Vyplňte model',
      year: year && `Rok výroby má byť od ${firstVehicleYear} do ${lastVehicleYear(localYear(new Date()))}`,
      fuel: fuel && 'Vyberte palivo zo zoznamu',
      mileageKm: mileageKm && `Stav km má byť celé číslo od 0 do ${formatWhole(maxMileageKm)}`,
    },
    existing: result.existing,
  };
}

/**
 * Server Action of the form for a new vehicle. It checks the session itself: the proxy only sees a
 * cookie, and the action is a public endpoint. The Majiteľ is the Zákazník the form was opened for;
 * once the fields parse and the VIN is free, one that does not exist is a page that does not exist.
 */
export async function addVehicle(_state: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const user = await currentUser();
  const ownerId = String(formData.get('ownerId') ?? '');
  const values = read(formData);

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
  const values = read(formData);

  const result = await orForbidden(updateVehicle(user, id, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.vehicle) notFound();
    return refused(values, result);
  }
  redirect(`/vozidla/${id}`);
}
