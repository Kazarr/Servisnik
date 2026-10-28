'use client';

import { useActionState } from 'react';
import { CustomerFields } from '../../../zakaznici/customer-fields.tsx';
import { VehicleFields } from '../../../vozidla/vehicle-fields.tsx';
import { FormError } from '../../../field.tsx';
import { valueIn } from '../../../form-value.ts';
import { addIntake } from '../../actions.ts';
import { OrderFields } from '../../order-fields.tsx';

/**
 * The form of an intake with a new Vozidlo: the Vozidlo and the Zákazka, and the Majiteľ, who is the
 * existing Zákazník `ownerId` or, without it, a new one whose fields are on the form. One save saves
 * all of it, or none (addIntake).
 */
export function IntakeForm({ ownerId }: { ownerId?: string }) {
  const [state, formAction, pending] = useActionState(addIntake, null);
  const errors = state?.errors ?? {};

  // noValidate: the browser would stop an e-mail it dislikes before the server could say why, and the rules are the domain's.
  return (
    <form action={formAction} className="form" noValidate>
      {ownerId && <input type="hidden" name="ownerId" value={ownerId} />}
      <FormError message={errors.form} />
      {!ownerId && (
        <>
          <h2>Zákazník</h2>
          <CustomerFields
            intake
            type="person"
            value={valueIn(state && { values: state.values.customer })}
            errors={errors.customer ?? {}}
            existing={state?.existingCustomer}
          />
        </>
      )}
      <h2>Vozidlo</h2>
      <VehicleFields intake value={valueIn(state && { values: state.values.vehicle })} errors={errors.vehicle ?? {}} existing={state?.existingVehicle} />
      <h2>Zákazka</h2>
      <OrderFields value={valueIn(state && { values: state.values.order })} errors={errors.order ?? {}} />
      <button type="submit" disabled={pending}>
        Uložiť zákazku
      </button>
    </form>
  );
}
