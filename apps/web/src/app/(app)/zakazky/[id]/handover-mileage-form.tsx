'use client';

import { useActionState } from 'react';
import { formatWhole } from '../../../../format.ts';
import { Field, FormError } from '../../field.tsx';
import { valueIn } from '../../form-value.ts';
import { saveHandoverMileage } from '../actions.ts';

/**
 * The form of the Kilometre pri odovzdaní (GLOSSARY) of the Zákazka `workOrderId`, which the page draws only for a Zákazka that is Hotová
 * or Vyfakturovaná. The field starts with the kilometres the Zákazka has (`mileageKm`) and is optional: a blank clears them. Kilometres
 * saved lower than those at intake are told here as a notice, since the odometer may have been replaced.
 */
export function HandoverMileageForm({ workOrderId, mileageKm }: { workOrderId: string; mileageKm: number | null }) {
  const [state, formAction, pending] = useActionState(saveHandoverMileage, null);
  const value = valueIn(state, { handoverMileageKm: mileageKm === null ? '' : String(mileageKm) });

  return (
    <form action={formAction} aria-label="Kilometre pri odovzdaní" className="form">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <FormError message={state?.errors.form} />
      <Field
        label="Kilometre pri odovzdaní"
        name="handoverMileageKm"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={value('handoverMileageKm')}
        error={state?.errors.handoverMileageKm}
      />
      <button type="submit" disabled={pending}>
        Uložiť kilometre
      </button>
      {state?.lowerThanIntake && (
        <div role="status" className="notice">
          <p>Kilometre pri odovzdaní sú uložené.</p>
          <p>
            Upozornenie: sú nižšie ako kilometre pri príjme ({formatWhole(state.lowerThanIntake.intakeKm)} km), stav km vozidla je{' '}
            {formatWhole(state.lowerThanIntake.vehicleMileageKm)} km.
          </p>
        </div>
      )}
    </form>
  );
}
