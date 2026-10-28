import { can } from '@servisnik/domain/access';
import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { listWorkOrders } from '../../../dal/work-orders.ts';
import { intakePaths } from './nova/paths.ts';
import { WorkOrderList } from './work-order-list.tsx';

export const metadata: Metadata = { title: 'Zákazky' };

export default async function WorkOrdersPage() {
  const user = await currentUserWith('work-orders.list');
  const orders = await listWorkOrders(user);
  return (
    <>
      <div className="page-header">
        <h1>Zákazky</h1>
        {can(user.role, 'work-orders.write') && (
          <Link href={intakePaths.start} className="button">
            Nová zákazka
          </Link>
        )}
      </div>
      <WorkOrderList orders={orders} role={user.role} />
    </>
  );
}
