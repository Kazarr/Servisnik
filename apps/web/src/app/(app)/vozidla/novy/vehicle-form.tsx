'use client';

import { useActionState } from 'react';
import { Field, FormError } from '../../field.tsx';
import { addVehicle } from '../actions.ts';

export function VehicleForm({ ownerId }: { ownerId: string }) {
  const [state, formAction, pending] = useActionState(addVehicle, null);
  const value = (name: string) => state?.values[name];

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="ownerId" value={ownerId} />
      <FormError message={state?.errors.form} />
      <Field label="VIN" name="vin" defaultValue={value('vin')} error={state?.errors.vin} autoComplete="off" required />
      <Field label="ŠPZ" name="licensePlate" defaultValue={value('licensePlate')} autoComplete="off" />
      <Field label="Značka" name="make" defaultValue={value('make')} error={state?.errors.make} required />
      <Field label="Model" name="model" defaultValue={value('model')} error={state?.errors.model} required />
      <button type="submit" disabled={pending}>
        Uložiť vozidlo
      </button>
    </form>
  );
}
