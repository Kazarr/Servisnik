'use client';

import type { RegistrationStatus } from '@servisnik/domain/joy-ride';
import { useActionState } from 'react';
import { FormError } from '../field.tsx';
import { decideRegistration } from './actions.ts';

/**
 * The buttons that approve or reject the Registrácia of `name` in the list, one click each. The one for the Stav it already has is not
 * shown; the other one takes the decision back. A user whose Rola may not decide is told so.
 */
export function DecisionForm({ registrationId, name, status }: { registrationId: string; name: string; status: RegistrationStatus }) {
  const [state, formAction, pending] = useActionState(decideRegistration, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="registrationId" value={registrationId} />
      {status !== 'approved' && (
        <button type="submit" name="status" value="approved" disabled={pending} aria-label={`Schváliť ${name}`}>
          Schváliť
        </button>
      )}
      {status !== 'rejected' && (
        <button type="submit" name="status" value="rejected" disabled={pending} aria-label={`Zamietnuť ${name}`}>
          Zamietnuť
        </button>
      )}
      <FormError message={state?.error} />
    </form>
  );
}
