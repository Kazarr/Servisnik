import { canEdit } from '@servisnik/domain/work-order';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getWorkOrder } from '../../../../../dal/work-orders.ts';
import { editWorkOrder } from '../../actions.ts';
import { WorkOrderForm } from '../../work-order-form.tsx';

export const metadata: Metadata = { title: 'Upraviť zákazku' };

/**
 * The form of the header of a Zákazka. A Zákazka that is not Rozpracovaná has nothing to edit, so the
 * page leads back to its detail; the DAL refuses the write whatever the page shows.
 */
export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('work-orders.write');
  const { id } = await params;
  const order = await getWorkOrder(user, id);
  if (!order) notFound();
  if (!canEdit(order.status)) redirect(`/zakazky/${order.id}`);

  const { mileageKm, customerRequest, deadline, note } = order;
  return (
    <>
      <h1>Upraviť zákazku</h1>
      <p>
        Zákazka: <strong>{order.number}</strong>
      </p>
      <WorkOrderForm action={editWorkOrder} saved={{ id: order.id, mileageKm, customerRequest, deadline, note }} />
    </>
  );
}
