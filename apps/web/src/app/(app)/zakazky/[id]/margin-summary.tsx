import type { Margin } from '@servisnik/domain/work-order';
import { formatEuro, formatPartCount, formatPercent } from '../../../../format.ts';

/**
 * What the Zákazka earns on its items: the purchase of its Diely without VAT, and the Marža in € and, when the sale is
 * more than 0, in % of it (the domain gives no percentage at a sale of 0, `Margin.percentTenths`). A Diel with no Nákupná cena
 * counts as 0 in the Marža, so the notice under it says how many, and that the Marža is incomplete.
 */
export function MarginSummary({ margin }: { margin: Margin }) {
  return (
    <>
      <dl className="details">
        <div>
          <dt>Nákup dielov bez DPH</dt>
          <dd>{formatEuro(margin.purchaseNet)}</dd>
        </div>
        <div>
          <dt>Marža</dt>
          <dd>
            {formatEuro(margin.cents)}
            {margin.percentTenths !== null && ` (${formatPercent(margin.percentTenths)})`}
          </dd>
        </div>
      </dl>
      {margin.partsWithoutPurchasePrice > 0 && (
        <p role="status" className="notice">
          Marža je neúplná: {formatPartCount(margin.partsWithoutPurchasePrice)} bez nákupnej ceny
        </p>
      )}
    </>
  );
}
