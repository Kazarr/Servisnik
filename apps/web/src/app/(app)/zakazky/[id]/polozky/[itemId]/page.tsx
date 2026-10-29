import { canEdit } from '@servisnik/domain/work-order';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserWith } from '../../../../../../dal/current-user.ts';
import { getRates } from '../../../../../../dal/settings.ts';
import { getWorkOrder } from '../../../../../../dal/work-orders.ts';
import { ItemForm } from '../../item-form.tsx';

export const metadata: Metadata = { title: 'Upraviť položku' };

/** The page where the admin edits one item of a Zákazka; a Zákazka that can no longer change its items sends him back to it. */
export default async function EditItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await currentUserWith('work-orders.write');
  const { id, itemId } = await params;
  const order = await getWorkOrder(user, id);
  const item = order?.items.find((found) => found.id === itemId);
  if (!order || !item) notFound();
  if (!canEdit(order.status)) redirect(`/zakazky/${order.id}`);
  const rates = await getRates(user);

  return (
    <>
      <h1>Upraviť položku</h1>
      <p>
        Zákazka <Link href={`/zakazky/${order.id}`}>{order.number}</Link>
      </p>
      <ItemForm
        rates={rates}
        target={{
          item: {
            id: item.id,
            kind: item.kind,
            code: item.code,
            name: item.name,
            quantityHundredths: item.quantityHundredths,
            unit: item.unit,
            purchasePriceCents: item.purchasePriceCents,
            salePriceCents: item.salePriceCents,
            vatRate: item.vatRate,
          },
        }}
      />
    </>
  );
}
