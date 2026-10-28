'use client';

import { useActionState } from 'react';
import { FormError } from './field.tsx';

/** What a delete action answers when it did not delete: the reason, shown above the button. */
export type DeleteState = { error: string } | null;

/**
 * The delete button of a detail page. The summary of the native `<details>` only opens the question;
 * "Potvrdiť zmazanie" alone sends the id to `action`, like the cancelling of a Zákazka (status-form.tsx).
 */
export function DeleteForm({
  id,
  action,
  label,
  question,
}: {
  id: string;
  action: (state: DeleteState, formData: FormData) => Promise<DeleteState>;
  label: string;
  question: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <>
      <FormError message={state?.error} />
      <div className="actions">
        <details>
          <summary>{label}</summary>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <p>{question}</p>
            <button type="submit" disabled={pending}>
              Potvrdiť zmazanie
            </button>
          </form>
        </details>
      </div>
    </>
  );
}
