import { canEdit, userTransitions } from '@servisnik/domain/work-order';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getRates } from '../../../../dal/settings.ts';
import { getWorkOrder } from '../../../../dal/work-orders.ts';
import { formatDate, formatEuro, formatQuantity, formatWhole } from '../../../../format.ts';
import { workOrderStatusLabels } from '../status-labels.ts';
import { LabourForm } from './labour-form.tsx';
import { StatusForm } from './status-form.tsx';

export const metadata: Metadata = { title: 'Zákazka' };

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('work-orders.read');
  const order = await getWorkOrder(user, (await params).id);
  if (!order) notFound();
  const transitions = userTransitions(order.status);
  const rates = canEdit(order.status) ? await getRates(user) : null; // only the form for new work uses them

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
        <p>Zatiaľ žiadna práca.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Názov</th>
                <th scope="col" className="amount">Množstvo</th>
                <th scope="col" className="amount">Cena za jednotku bez DPH</th>
                <th scope="col" className="amount">Sadzba DPH</th>
                <th scope="col" className="amount">Bez DPH</th>
                <th scope="col" className="amount">DPH</th>
                <th scope="col" className="amount">S DPH</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="amount">
                    {formatQuantity(item.quantityHundredths)} {item.unit}
                  </td>
                  <td className="amount">{formatEuro(item.unitPriceCents)}</td>
                  <td className="amount">{item.vatRate} %</td>
                  <td className="amount">{formatEuro(item.amounts.net)}</td>
                  <td className="amount">{formatEuro(item.amounts.vat)}</td>
                  <td className="amount">{formatEuro(item.amounts.gross)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>
                  Spolu
                </th>
                <td className="amount">{formatEuro(order.totals.net)}</td>
                <td className="amount">{formatEuro(order.totals.vat)}</td>
                <td className="amount">{formatEuro(order.totals.gross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rates && (
        <>
          <h2>Pridať prácu</h2>
          <LabourForm workOrderId={order.id} defaultVatRate={rates.defaultVatRate} hourlyRateCents={rates.hourlyRateCents} />
        </>
      )}
      {transitions.length > 0 && <StatusForm workOrderId={order.id} transitions={transitions} />}
    </>
  );
}
