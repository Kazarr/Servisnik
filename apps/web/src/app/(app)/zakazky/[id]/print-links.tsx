import { can, type Capability, type Role } from '@servisnik/domain/access';
import { canPrintHandover, type WorkOrderStatus } from '@servisnik/domain/work-order';

/**
 * The forms, the capability that prints each and, for a form that is printed only in some statuses, the rule for them
 * (packages/domain/src/access, packages/domain/src/work-order). A button is drawn only where its Route Handler would
 * not refuse: not for a Rola that gets a 403, and not for a Zákazka in a status that gets a 409.
 */
const forms: readonly { path: string; label: string; capability: Capability; printedIn?: (status: WorkOrderStatus) => boolean }[] = [
  { path: 'zakazkovy-list', label: 'Zákazkový list', capability: 'work-orders.job-sheet' },
  { path: 'cenova-ponuka', label: 'Cenová ponuka', capability: 'work-orders.quote' },
  { path: 'odovzdavaci-protokol', label: 'Odovzdávací protokol', capability: 'work-orders.handover', printedIn: canPrintHandover },
];

/**
 * The links of a Zákazka in `status` that download the printed forms `role` may print. Each is a Route Handler that answers a PDF
 * (app/(app)/zakazky/[id]/zakazkovy-list/route.ts, cenova-ponuka/route.ts, odovzdavaci-protokol/route.ts), so it is a plain
 * link, not a Next one: the browser saves what comes back.
 */
export function PrintLinks({ workOrderId, role, status }: { workOrderId: string; role: Role; status: WorkOrderStatus }) {
  return (
    <div className="actions">
      {forms
        .filter(({ capability, printedIn }) => can(role, capability) && (printedIn?.(status) ?? true))
        .map(({ path, label }) => (
          <a key={path} className="button" href={`/zakazky/${workOrderId}/${path}`}>
            {label}
          </a>
        ))}
    </div>
  );
}
