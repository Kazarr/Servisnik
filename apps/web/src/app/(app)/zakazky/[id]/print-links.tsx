/**
 * The links of a Zákazka that download its printed forms. Each is a Route Handler that answers a PDF
 * (app/(app)/zakazky/[id]/zakazkovy-list/route.ts, cenova-ponuka/route.ts, odovzdavaci-protokol/route.ts), so it is a plain
 * link, not a Next one: the browser saves what comes back.
 */
export function PrintLinks({ workOrderId }: { workOrderId: string }) {
  return (
    <div className="actions">
      <a className="button" href={`/zakazky/${workOrderId}/zakazkovy-list`}>
        Zákazkový list
      </a>
      <a className="button" href={`/zakazky/${workOrderId}/cenova-ponuka`}>
        Cenová ponuka
      </a>
      <a className="button" href={`/zakazky/${workOrderId}/odovzdavaci-protokol`}>
        Odovzdávací protokol
      </a>
    </div>
  );
}
