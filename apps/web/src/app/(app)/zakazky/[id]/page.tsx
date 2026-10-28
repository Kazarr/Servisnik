import { can } from '@servisnik/domain/access';
import { canEdit, userTransitions } from '@servisnik/domain/work-order';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getRates } from '../../../../dal/settings.ts';
import { getWorkOrder } from '../../../../dal/work-orders.ts';
import { formatDate, formatEuro, formatPartCount, formatPercent, formatQuantity, formatWhole } from '../../../../format.ts';
import { first, pageOf } from '../../search-params.ts';
import { workOrderStatusLabels } from '../status-labels.ts';
import { DeleteItemForm } from './delete-item-form.tsx';
import { ItemForm } from './item-form.tsx';
import { PriceListSearch } from './price-list-search.tsx';
import { StatusForm } from './status-form.tsx';

export const metadata: Metadata = { title: 'Zákazka' };

export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[]; strana?: string | string[] }>;
}) {
  const user = await currentUserWith('work-orders.read');
  const order = await getWorkOrder(user, (await params).id);
  const { q, strana } = await searchParams;
  if (!order) notFound();
  const transitions = userTransitions(order.status);
  const rates = canEdit(order.status) ? await getRates(user) : null; // only the forms for the items use them, and only while they can change

  return (
    <>
      <div className="page-header">
        <h1>{order.number}</h1>
        {canEdit(order.status) && (
          <Link href={`/zakazky/${order.id}/upravit`} className="button">
            Upraviť zákazku
          </Link>
        )}
      </div>
      <dl className="details">
        <div>
          <dt>Stav</dt>
          <dd>{workOrderStatusLabels[order.status]}</dd>
        </div>
        {order.completedOn && (
          <div>
            <dt>Dátum dokončenia</dt>
            <dd>{formatDate(order.completedOn)}</dd>
          </div>
        )}
        {order.deadline && (
          <div>
            <dt>Termín</dt>
            <dd>{formatDate(order.deadline)}</dd>
          </div>
        )}
        <div>
          <dt>Zákazník</dt>
          <dd>
            <Link href={`/zakaznici/${order.customer.id}`}>{order.customer.name}</Link>
          </dd>
        </div>
        <div>
          <dt>Vozidlo</dt>
          <dd>
            <Link href={`/vozidla/${order.vehicle.id}`}>
              {order.vehicle.make} {order.vehicle.model}
            </Link>{' '}
            ({order.vehicle.vin})
          </dd>
        </div>
        <div>
          <dt>Kilometre pri príjme</dt>
          <dd>{formatWhole(order.mileageKm)} km</dd>
        </div>
        <div>
          <dt>Požiadavka zákazníka</dt>
          <dd className="multiline">{order.customerRequest}</dd>
        </div>
        {order.note && (
          <div>
            <dt>Poznámka</dt>
            <dd className="multiline">{order.note}</dd>
          </div>
        )}
      </dl>

      <h2>Položky</h2>
      {order.items.length === 0 ? (
        <p>Zatiaľ žiadna položka.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table aria-label="Položky zákazky">
              <thead>
                <tr>
                  <th scope="col">Kód</th>
                  <th scope="col">Názov</th>
                  <th scope="col" className="amount">Množstvo</th>
                  <th scope="col" className="amount">Nákupná cena za jednotku bez DPH</th>
                  <th scope="col" className="amount">Predajná cena za jednotku bez DPH</th>
                  <th scope="col" className="amount">Sadzba DPH</th>
                  <th scope="col" className="amount">Bez DPH</th>
                  <th scope="col" className="amount">DPH</th>
                  <th scope="col" className="amount">S DPH</th>
                  {rates && <th scope="col">Akcie</th>}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>{item.name}</td>
                    <td className="amount">
                      {formatQuantity(item.quantityHundredths)} {item.unit}
                    </td>
                    <td className="amount">{item.purchasePriceCents === null ? '—' : formatEuro(item.purchasePriceCents)}</td>
                    <td className="amount">{formatEuro(item.unitPriceCents)}</td>
                    <td className="amount">{item.vatRate} %</td>
                    <td className="amount">{formatEuro(item.amounts.net)}</td>
                    <td className="amount">{formatEuro(item.amounts.vat)}</td>
                    <td className="amount">{formatEuro(item.amounts.gross)}</td>
                    {rates && (
                      <td>
                        <div className="row-actions">
                          <Link href={`/zakazky/${order.id}/polozky/${item.id}`} aria-label={`Upraviť ${item.name}`}>
                            Upraviť
                          </Link>
                          <DeleteItemForm itemId={item.id} workOrderId={order.id} name={item.name} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={6}>
                    Spolu
                  </th>
                  <td className="amount">{formatEuro(order.totals.net)}</td>
                  <td className="amount">{formatEuro(order.totals.vat)}</td>
                  <td className="amount">{formatEuro(order.totals.gross)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <dl className="details">
            <div>
              <dt>Nákup dielov bez DPH</dt>
              <dd>{formatEuro(order.margin.purchaseNet)}</dd>
            </div>
            <div>
              <dt>Marža</dt>
              <dd>
                {formatEuro(order.margin.cents)}
                {order.margin.percentTenths !== null && ` (${formatPercent(order.margin.percentTenths)})`}
              </dd>
            </div>
          </dl>
          {order.margin.partsWithoutPurchasePrice > 0 && (
            <p role="status" className="notice">
              Marža je neúplná: {formatPartCount(order.margin.partsWithoutPurchasePrice)} bez nákupnej ceny
            </p>
          )}
        </>
      )}

      {rates && (
        <>
          {can(user.role, 'price-list.read') && <PriceListSearch user={user} workOrderId={order.id} query={first(q)} page={pageOf(strana)} />}
          <h2>Pridať prácu</h2>
          <ItemForm rates={rates} target={{ workOrderId: order.id, kind: 'labour' }} />
          <h2>Pridať diel</h2>
          <ItemForm rates={rates} target={{ workOrderId: order.id, kind: 'part' }} />
        </>
      )}
      {transitions.length > 0 && <StatusForm workOrderId={order.id} transitions={transitions} />}
    </>
  );
}
