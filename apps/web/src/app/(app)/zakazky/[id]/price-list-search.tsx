import { searchPriceList } from '../../../../dal/price-list.ts';
import type { User } from '../../../../dal/user.ts';
import { formatEuro } from '../../../../format.ts';
import { Field } from '../../field.tsx';
import { itemKindLabels } from '../../../../item-kind-labels.ts';
import { Pager } from '../../pager.tsx';
import { searchHref } from '../../search-params.ts';
import { AddFromPriceListForm } from './add-from-price-list-form.tsx';

/**
 * The section where the admin finds a Položka cenníka by a part of its code or name and adds it to the Zákazka with
 * a click. The page of the Zákazka shows it only while the Zákazka is Rozpracovaná, and the DAL refuses an add to any
 * other. Nothing is listed until something is searched for; the search is the `?q=` of the address, with the page in
 * `?strana=`, so the results stay where they are while items are added.
 */
export async function PriceListSearch({ user, workOrderId, query, page }: { user: User; workOrderId: string; query: string; page: number }) {
  const path = `/zakazky/${workOrderId}`;
  const found = query.trim() ? await searchPriceList(user, { query, page }) : null;

  return (
    <>
      <h2>Pridať z cenníka</h2>
      <form role="search" action={path} className="search">
        <Field label="Hľadať v cenníku" name="q" type="search" defaultValue={query} placeholder="Kód alebo názov" />
        <button type="submit">Hľadať</button>
      </form>
      {found &&
        (found.items.length === 0 ? (
          <p>Nič sa nenašlo pre „{query}“.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table aria-label="Výsledky hľadania v cenníku">
                <thead>
                  <tr>
                    <th scope="col">Typ</th>
                    <th scope="col">Kód</th>
                    <th scope="col">Názov</th>
                    <th scope="col">Jednotka</th>
                    <th scope="col" className="amount">Predajná cena za jednotku bez DPH</th>
                    <th scope="col" className="amount">Sadzba DPH</th>
                    <th scope="col">Akcie</th>
                  </tr>
                </thead>
                <tbody>
                  {found.items.map((item) => (
                    <tr key={item.id}>
                      <td>{itemKindLabels[item.kind]}</td>
                      <td>{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td className="amount">{formatEuro(item.salePriceCents)}</td>
                      <td className="amount">{item.vatRate} %</td>
                      <td>
                        <AddFromPriceListForm priceListItemId={item.id} workOrderId={workOrderId} name={item.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={found.page} pageCount={found.pageCount} href={(n) => searchHref(path, query, n)} />
          </>
        ))}
    </>
  );
}
