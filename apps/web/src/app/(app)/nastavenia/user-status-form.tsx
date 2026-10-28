'use client';

import { useActionState } from 'react';
import { FormError } from '../field.tsx';
import { activateUserAction, deactivateUserAction } from './user-actions.ts';

/**
 * The button that changes the state of a Používateľ: Deaktivovať, which asks for a confirmation in a
 * native `<details>` because it ends his sign-ins at once, or Aktivovať for a Deaktivovaný používateľ.
 * The page shows the new state after the action, so the other button takes this one's place.
 */
export function UserStatusForm({ userId, banned }: { userId: string; banned: boolean }) {
  return banned ? <ActivateForm userId={userId} /> : <DeactivateForm userId={userId} />;
}

function DeactivateForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(deactivateUserAction, null);
  return (
    <>
      <FormError message={state?.error} />
      <details>
        <summary>Deaktivovať</summary>
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <p>Používateľ sa už neprihlási a jeho prihlásenia sa hneď ukončia. Neskôr ho môžete znova aktivovať.</p>
          <button type="submit" disabled={pending}>
            Potvrdiť deaktiváciu
          </button>
        </form>
      </details>
    </>
  );
}

function ActivateForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(activateUserAction, null);
  return (
    <>
      <FormError message={state?.error} />
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <button type="submit" disabled={pending}>
          Aktivovať
        </button>
      </form>
    </>
  );
}
