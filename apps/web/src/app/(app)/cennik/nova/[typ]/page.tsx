import type { ItemKind } from '@servisnik/domain/work-order';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getRates } from '../../../../../dal/settings.ts';
import { PriceListForm } from '../../price-list-form.tsx';

export const metadata: Metadata = { title: 'Nová položka cenníka' };

/** The address names the kind of the new item: `praca` for a Práca, `diel` for a Diel. */
const kindOf: Record<string, ItemKind> = { praca: 'labour', diel: 'part' };

export default async function NewPriceListItemPage({ params }: { params: Promise<{ typ: string }> }) {
  const user = await currentUserWith('price-list.write');
  const kind = kindOf[(await params).typ];
  if (!kind) notFound();

  return (
    <>
      <h1>{kind === 'part' ? 'Nový diel v cenníku' : 'Nová práca v cenníku'}</h1>
      <PriceListForm rates={await getRates(user)} target={{ kind }} />
    </>
  );
}
