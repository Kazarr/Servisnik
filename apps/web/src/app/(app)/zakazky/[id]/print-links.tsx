import { can, type Capability, type Role } from '@servisnik/domain/access';

/** The forms and the capability that prints each (packages/domain/src/access); a button is drawn only for a Rola whose Route Handler would not answer 403. */
const forms: readonly { path: string; label: string; capability: Capability }[] = [
  { path: 'zakazkovy-list', label: 'Zákazkový list', capability: 'work-orders.job-sheet' },
  { path: 'cenova-ponuka', label: 'Cenová ponuka', capability: 'work-orders.quote' },
  { path: 'odovzdavaci-protokol', label: 'Odovzdávací protokol', capability: 'work-orders.handover' },
];

/**
 * The links of a Zákazka that download the printed forms `role` may print. Each is a Route Handler that answers a PDF
 * (app/(app)/zakazky/[id]/zakazkovy-list/route.ts, cenova-ponuka/route.ts, odovzdavaci-protokol/route.ts), so it is a plain
 * link, not a Next one: the browser saves what comes back.
 */
export function PrintLinks({ workOrderId, role }: { workOrderId: string; role: Role }) {
  return (
    <div className="actions">
      {forms
        .filter(({ capability }) => can(role, capability))
        .map(({ path, label }) => (
          <a key={path} className="button" href={`/zakazky/${workOrderId}/${path}`}>
            {label}
          </a>
        ))}
    </div>
  );
}
