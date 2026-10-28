import type { Role } from '@servisnik/domain/access';
import type { UnpricedWorkOrder } from '../../../../dal/unpriced-work-order.ts';
import { formatDate, formatQuantity, formatWhole } from '../../../../format.ts';
import { itemKindLabels } from '../../item-kind-labels.ts';
import { workOrderStatusLabels } from '../status-labels.ts';
import { PrintLinks } from './print-links.tsx';

/**
 * The detail of a Zákazka for a Rola that reads it without prices (the mechanik, spec #95): what it draws is the
 * allowed fields of `UnpricedWorkOrder` by name, and nothing is a form, a button or a link to a page he may not
 * open, so nothing in it changes the Zákazka. It is a server-rendered component with no client component inside,
 * so nothing but this markup is sent.
 */
export function UnpricedWorkOrderView({ order, role }: { order: UnpricedWorkOrder; role: Role }) {
  return (
    <>
      <div className="page-header">
        <h1>{order.number}</h1>
      </div>
      <dl className="details">
        <div>
          <dt>Stav</dt>
          <dd>{workOrderStatusLabels[order.status]}</dd>
        </div>
        {order.deadline && (
          <div>
            <dt>Termín</dt>
            <dd>{formatDate(order.deadline)}</dd>
          </div>
        )}
        <div>
          <dt>Zákazník</dt>
          <dd>{order.customer.name}</dd>
        </div>
        <div>
          <dt>Vozidlo</dt>
          <dd>
            {order.vehicle.make} {order.vehicle.model} ({order.vehicle.vin})
          </dd>
        </div>
        {order.vehicle.licensePlate && (
          <div>
            <dt>ŠPZ</dt>
            <dd>{order.vehicle.licensePlate}</dd>
          </div>
        )}
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
      <PrintLinks workOrderId={order.id} role={role} />

      <h2>Položky</h2>
      {order.items.length === 0 ? (
        <p>Zatiaľ žiadna položka.</p>
      ) : (
        <div className="table-wrap">
          <table aria-label="Položky zákazky">
            <thead>
              <tr>
                <th scope="col">Typ</th>
                <th scope="col">Kód</th>
                <th scope="col">Názov</th>
                <th scope="col" className="amount">Množstvo</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index}>
                  <td>{itemKindLabels[item.kind]}</td>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td className="amount">
                    {formatQuantity(item.quantityHundredths)} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
