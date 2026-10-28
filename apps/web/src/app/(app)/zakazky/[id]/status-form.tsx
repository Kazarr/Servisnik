'use client';

import type { WorkOrderStatus } from '@servisnik/domain/work-order';
import { useActionState } from 'react';
import { FormError } from '../../field.tsx';
import { changeStatus } from '../actions.ts';
import { workOrderStatusLabels } from '../status-labels.ts';

/** What the button to a status says: the status itself, except for the two that are an act. */
const buttonLabel = (to: WorkOrderStatus) => (to === 'done' ? 'Označiť ako hotovú' : to === 'cancelled' ? 'Zrušiť zákazku' : workOrderStatusLabels[to]);

/**
 * The buttons of a Zákazka: one per transition its status allows (`userTransitions` of the domain,
 * which the page passes in). The one that needs a confirmation, today only Zrušená, opens a native
 * `<details>` with the question, and only its own button sends `confirmed`. A user whose Rola may not
 * do it is told so.
 */
export function StatusForm({ workOrderId, transitions }: { workOrderId: string; transitions: { to: WorkOrderStatus; confirm: boolean }[] }) {
  const [state, formAction, pending] = useActionState(changeStatus, null);

  return (
    <>
      <FormError message={state?.error} />
      <div className="actions">
        <form action={formAction}>
          <input type="hidden" name="workOrderId" value={workOrderId} />
          {transitions
            .filter(({ confirm }) => !confirm)
            .map(({ to }) => (
              <button key={to} type="submit" name="to" value={to} disabled={pending}>
                {buttonLabel(to)}
              </button>
            ))}
        </form>
        {transitions
          .filter(({ confirm }) => confirm)
          .map(({ to }) => (
            <details key={to}>
              <summary>{buttonLabel(to)}</summary>
              <form action={formAction}>
                <input type="hidden" name="workOrderId" value={workOrderId} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="confirmed" value="yes" />
                <p>Zrušenú zákazku nemožno vrátiť a jej číslo ostane obsadené.</p>
                <button type="submit" disabled={pending}>
                  Potvrdiť zrušenie
                </button>
              </form>
            </details>
          ))}
      </div>
    </>
  );
}
