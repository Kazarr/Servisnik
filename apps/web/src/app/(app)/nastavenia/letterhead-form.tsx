'use client';

import { letterheads, type Letterhead } from '@servisnik/domain/print';
import { useActionState } from 'react';
import { FormError, SelectField } from '../field.tsx';
import { saveLetterheadAction } from './actions.ts';

const letterheadLabels: Record<Letterhead, string> = { white: 'Biela', blackBar: 'Čierny pruh' };

/** The Hlavička tlačív, shown as `initial`; after a save or a refusal the select shows what the action answered. */
export function LetterheadForm({ initial }: { initial: Letterhead }) {
  const [state, formAction, pending] = useActionState(saveLetterheadAction, null);
  const value = state?.letterhead ?? initial;

  return (
    <form action={formAction} className="form" noValidate>
      <FormError message={state?.error} />
      {/* React updates the default of an input when it changes, but not of a select: the key makes a new select of it, so the reset after the action keeps the choice. */}
      <SelectField key={value} label="Hlavička tlačív" name="letterhead" defaultValue={value}>
        {letterheads.map((letterhead) => (
          <option key={letterhead} value={letterhead}>
            {letterheadLabels[letterhead]}
          </option>
        ))}
      </SelectField>
      {state?.saved && <p role="status">Hlavička tlačív je uložená.</p>}
      <button type="submit" disabled={pending}>
        Uložiť hlavičku tlačív
      </button>
    </form>
  );
}
