'use client';

import type { Fuel } from '@servisnik/domain/vehicle';
import { useActionState } from 'react';
import { FormError } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import type { VehicleFormState } from './actions.ts';
import { VehicleFields } from './vehicle-fields.tsx';

type Saved = {
  id: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  fuel: Fuel | null;
  mileageKm: number | null;
  note: string | null;
};

/**
 * The form of a new Vozidlo for the Majiteľ `ownerId`, or with `vehicle` the form that edits it, where
 * the Majiteľ stays as it is. `action` is addVehicle or editVehicle.
 */
export function VehicleForm({
  action,
  ownerId,
  vehicle,
}: {
  action: (state: VehicleFormState, formData: FormData) => Promise<VehicleFormState>;
  ownerId?: string;
  vehicle?: Saved;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const saved = {
    vin: vehicle?.vin ?? '',
    licensePlate: vehicle?.licensePlate ?? '',
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    year: String(vehicle?.year ?? ''),
    fuel: vehicle?.fuel ?? '',
    mileageKm: String(vehicle?.mileageKm ?? ''),
    note: vehicle?.note ?? '',
  };
  const value = valueIn(state, saved);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="form">
      {ownerId && <input type="hidden" name="ownerId" value={ownerId} />}
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      <FormError message={errors.form} />
      <VehicleFields value={value} errors={errors} existing={state?.existing} />
      <button type="submit" disabled={pending}>
        Uložiť vozidlo
      </button>
    </form>
  );
}
