'use client';

import { useActionState } from 'react';
import { FormError } from '../field.tsx';
import { deleteFromPriceList } from './actions.ts';

/** The "Zmazať" button of an item of the Cenník; a user whose Rola may not delete it is told so. */
export function DeletePriceListItemForm({ itemId, name }: { itemId: string; name: string }) {
  const [state, formAction, pending] = useActionState(deleteFromPriceList, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <FormError message={state?.error} />
      <button type="submit" disabled={pending} aria-label={`Zmazať ${name}`}>
        Zmazať
      </button>
    </form>
  );
}
