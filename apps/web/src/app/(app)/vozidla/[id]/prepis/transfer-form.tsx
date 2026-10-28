'use client';

import { useActionState } from 'react';
import { FormError } from '../../../field.tsx';
import { transferVehicle } from '../../actions.ts';

/** The confirmation of a Prepis: the ids of the Vozidlo, of the Majiteľ the page showed and of the new one travel with the button. */
export function TransferForm({ vehicleId, fromOwnerId, toOwnerId }: { vehicleId: string; fromOwnerId: string; toOwnerId: string }) {
  const [state, formAction, pending] = useActionState(transferVehicle, null);

  return (
    <form action={formAction} className="form">
      <FormError message={state?.error} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="fromOwnerId" value={fromOwnerId} />
      <input type="hidden" name="toOwnerId" value={toOwnerId} />
      <button type="submit" disabled={pending}>
        Potvrdiť prepis
      </button>
    </form>
  );
}
