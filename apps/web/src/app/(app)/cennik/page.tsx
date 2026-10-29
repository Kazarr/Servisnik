import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { searchPriceList } from '../../../dal/price-list.ts';
import { formatEuro } from '../../../format.ts';
import { Field } from '../field.tsx';
import { itemKindLabels } from '../../../item-kind-labels.ts';
import { Pager } from '../pager.tsx';
import { first, pageOf, searchHref } from '../search-params.ts';
import { DeletePriceListItemForm } from './delete-price-list-item-form.tsx';

export const metadata: Metadata = { title: 'Cenník' };

export default async function PriceListPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; strana?: string | string[] }> }) {
  const { q, strana } = await searchParams;
  const query = first(q);
  const { items, page, pageCount } = await searchPriceList(await currentUserWith('price-list.read'), { query, page: pageOf(strana) });
  return (
    <>
      <div className="page-header">
        <h1>Cenník</h1>
        <div className="row-actions">
          <Link href="/cennik/nova/praca" className="button">
            Pridať prácu
          </Link>
          <Link href="/cennik/nova/diel" className="button">
            Pridať diel
          </Link>
        </div>
      </div>
      <form role="search" action="/cennik" className="search">
        <Field label="Hľadať v cenníku" name="q" type="search" defaultValue={query} placeholder="Kód alebo názov" />
        <button type="submit">Hľadať</button>
      </form>
      {items.length === 0 ? (
        <p>{query.trim() ? `Nič sa nenašlo pre „${query}“.` : 'Cenník je zatiaľ prázdny.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Typ</th>
                <th scope="col">Kód</th>
                <th scope="col">Názov</th>
                <th scope="col">Jednotka</th>
                <th scope="col" className="amount">Nákupná cena za jednotku bez DPH</th>
                <th scope="col" className="amount">Predajná cena za jednotku bez DPH</th>
                <th scope="col" className="amount">Sadzba DPH</th>
                <th scope="col">Akcie</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{itemKindLabels[item.kind]}</td>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td className="amount">{item.purchasePriceCents === null ? '—' : formatEuro(item.purchasePriceCents)}</td>
                  <td className="amount">{formatEuro(item.salePriceCents)}</td>
                  <td className="amount">{item.vatRate} %</td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/cennik/${item.id}/upravit`} aria-label={`Upraviť ${item.name}`}>
                        Upraviť
                      </Link>
                      <DeletePriceListItemForm itemId={item.id} name={item.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => searchHref('/cennik', query, n)} />
    </>
  );
}
