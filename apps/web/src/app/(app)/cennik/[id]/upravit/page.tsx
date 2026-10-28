import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getPriceListItem } from '../../../../../dal/price-list.ts';
import { getRates } from '../../../../../dal/settings.ts';
import { PriceListForm } from '../../price-list-form.tsx';

export const metadata: Metadata = { title: 'Upraviť položku cenníka' };

export default async function EditPriceListItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('price-list.write');
  const item = await getPriceListItem(user, (await params).id);
  if (!item) notFound();

  return (
    <>
      <h1>Upraviť položku cenníka</h1>
      <PriceListForm rates={await getRates(user)} target={{ item }} />
    </>
  );
}
