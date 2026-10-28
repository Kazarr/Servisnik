/**
 * The links of a Zákazka that download its printed forms. Each is a Route Handler that answers a PDF
 * (app/(app)/zakazky/[id]/zakazkovy-list/route.ts), so it is a plain link, not a Next one: the browser saves what comes back.
 */
export function PrintLinks({ workOrderId }: { workOrderId: string }) {
  return (
    <div className="actions">
      <a className="button" href={`/zakazky/${workOrderId}/zakazkovy-list`}>
        Zákazkový list
      </a>
    </div>
  );
}
