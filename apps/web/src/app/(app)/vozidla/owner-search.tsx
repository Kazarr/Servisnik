import Link from 'next/link';
import { searchCustomers } from '../../../dal/customers.ts';
import type { User } from '../../../dal/user.ts';
import { Field } from '../field.tsx';
import { Pager } from '../pager.tsx';
import { searchHref } from '../search-params.ts';
import { customerTypeLabels } from '../zakaznici/type-labels.ts';

/**
 * The search for a Majiteľ, the same as on the list of Zákazníci, for the pages that pick one: the form
 * of a new Vozidlo, a Prepis, and the intake of a new Vozidlo with its Zákazka. Each result links to `path?zakaznik=<id>`, and `path` also receives the
 * search. `except` is the Majiteľ the Vozidlo has now, who is not offered.
 */
export async function OwnerSearch({ user, query, page, path, except }: { user: User; query: string; page: number; path: string; except?: string }) {
  const { customers, page: current, pageCount } = await searchCustomers(user, { query, page, except });
  return (
    <>
      <form role="search" action={path} className="search">
        <Field label="Hľadať majiteľa" name="q" type="search" defaultValue={query} placeholder="Názov, IČO, e-mail alebo telefón" />
        <button type="submit">Hľadať</button>
      </form>
      {customers.length === 0 ? (
        <p>{query.trim() ? `Nič sa nenašlo pre „${query}“.` : 'Zatiaľ tu nie je žiadny zákazník.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Majiteľ</th>
                <th scope="col">Typ</th>
                <th scope="col">IČO</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`${path}?zakaznik=${customer.id}`}>{customer.name}</Link>
                  </td>
                  <td>{customerTypeLabels[customer.type]}</td>
                  <td>{customer.ico}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={current} pageCount={pageCount} href={(n) => searchHref(path, query, n)} />
    </>
  );
}
