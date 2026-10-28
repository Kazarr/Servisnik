import Link from 'next/link';
import type { ReactNode } from 'react';
import { searchCustomers } from '../../../dal/customers.ts';
import type { User } from '../../../dal/user.ts';
import { Field } from '../field.tsx';
import { Pager } from '../pager.tsx';
import { searchHref } from '../search-params.ts';
import { customerTypeLabels } from '../zakaznici/type-labels.ts';

/**
 * Before the form of a new Vozidlo: its Majiteľ is found by the same search as on the list of Zákazníci,
 * and picking one leads to `ownerHref(id)`. The page is `path` and has the heading `title`; `children`
 * come under the heading, for a way on that is not a search.
 */
export async function PickOwner({
  user,
  query,
  page,
  path,
  title,
  ownerHref,
  children,
}: {
  user: User;
  query: string;
  page: number;
  path: string;
  title: string;
  ownerHref: (customerId: string) => string;
  children?: ReactNode;
}) {
  const { customers, page: current, pageCount } = await searchCustomers(user, { query, page });
  return (
    <>
      <h1>{title}</h1>
      {children}
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
                    <Link href={ownerHref(customer.id)}>{customer.name}</Link>
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
