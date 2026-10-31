'use client';

import { useActionState } from 'react';
import { FormError } from '../../field.tsx';
import { deleteItemOfWorkOrder } from '../actions.ts';

/** The "Zmazať" button of an item; a user whose Rola may not delete it, or a Zákazka that is no longer rozpracovaná, is told so. */
export function DeleteItemForm({ itemId, workOrderId, name }: { itemId: string; workOrderId: string; name: string }) {
  const [state, formAction, pending] = useActionState(deleteItemOfWorkOrder, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <FormError message={state?.error} />
      <button type="submit" className="secondary" disabled={pending} aria-label={`Zmazať ${name}`}>
        Zmazať
      </button>
    </form>
  );
}
