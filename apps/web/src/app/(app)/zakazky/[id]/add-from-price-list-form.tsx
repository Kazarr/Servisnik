'use client';

import { useActionState } from 'react';
import { FormError } from '../../field.tsx';
import { addPriceListItemToWorkOrder } from '../actions.ts';

/** The "Pridať" button of an item found in the Cenník; a user whose Rola may not add it, or a Zákazka that is no longer rozpracovaná, is told so. */
export function AddFromPriceListForm({ priceListItemId, workOrderId, name }: { priceListItemId: string; workOrderId: string; name: string }) {
  const [state, formAction, pending] = useActionState(addPriceListItemToWorkOrder, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="priceListItemId" value={priceListItemId} />
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <FormError message={state?.error} />
      <button type="submit" disabled={pending} aria-label={`Pridať ${name}`}>
        Pridať
      </button>
    </form>
  );
}
