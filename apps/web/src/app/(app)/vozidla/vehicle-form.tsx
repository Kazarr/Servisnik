'use client';

import { fuels, type Fuel } from '@servisnik/domain/vehicle';
import Link from 'next/link';
import { useActionState } from 'react';
import { Field, FormError, SelectField, TextAreaField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import type { VehicleFormState } from './actions.ts';
import { fuelLabels } from './fuel-labels.ts';

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
  const existing = state?.existing;
  const taken = existing && (
    <>
      {errors.vin}: <Link href={`/vozidla/${existing.id}`}>{existing.make} {existing.model}</Link>, majiteľ{' '}
      <Link href={`/zakaznici/${existing.owner.id}`}>{existing.owner.name}</Link>
    </>
  );

  return (
    <form action={formAction} className="form">
      {ownerId && <input type="hidden" name="ownerId" value={ownerId} />}
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
      <FormError message={errors.form} />
      <Field label="VIN" name="vin" defaultValue={value('vin')} error={taken || errors.vin} autoComplete="off" required />
      <Field label="ŠPZ" name="licensePlate" defaultValue={value('licensePlate')} autoComplete="off" />
      <Field label="Značka" name="make" defaultValue={value('make')} error={errors.make} required />
      <Field label="Model" name="model" defaultValue={value('model')} error={errors.model} required />
      <Field label="Rok výroby" name="year" defaultValue={value('year')} error={errors.year} inputMode="numeric" autoComplete="off" />
      <SelectField label="Palivo" name="fuel" defaultValue={value('fuel')} error={errors.fuel}>
        <option value="">—</option>
        {fuels.map((fuel) => (
          <option key={fuel} value={fuel}>
            {fuelLabels[fuel]}
          </option>
        ))}
      </SelectField>
      <Field label="Stav km" name="mileageKm" defaultValue={value('mileageKm')} error={errors.mileageKm} inputMode="numeric" autoComplete="off" />
      <TextAreaField label="Poznámka" name="note" defaultValue={value('note')} />
      <button type="submit" disabled={pending}>
        Uložiť vozidlo
      </button>
    </form>
  );
}
