'use client';

import { useActionState } from 'react';
import { FormError } from '../../field.tsx';
import { markDone } from '../actions.ts';

/** The "Označiť ako hotovú" button; a user whose Rola may not do it is told so. */
export function MarkDoneForm({ workOrderId }: { workOrderId: string }) {
  const [state, formAction, pending] = useActionState(markDone, null);

  return (
    <form action={formAction} className="actions">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <FormError message={state?.error} />
      <button type="submit" disabled={pending}>
        Označiť ako hotovú
      </button>
    </form>
  );
}
