import type { Metadata } from 'next';
import { currentUserWith } from '../../../dal/current-user.ts';
import { listWorkOrders } from '../../../dal/work-orders.ts';
import { WorkOrderList } from './work-order-list.tsx';

export const metadata: Metadata = { title: 'Zákazky' };

export default async function WorkOrdersPage() {
  const user = await currentUserWith('work-orders.list');
  const orders = await listWorkOrders(user);
  return (
    <>
      <h1>Zákazky</h1>
      <WorkOrderList orders={orders} role={user.role} />
    </>
  );
}
