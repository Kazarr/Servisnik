import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { searchCustomers } from '../../../dal/customers.ts';
import { Field } from '../field.tsx';
import { Pager } from '../pager.tsx';
import { first, pageOf, searchHref } from '../search-params.ts';
import { customerTypeLabels } from './type-labels.ts';

export const metadata: Metadata = { title: 'Zákazníci' };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; strana?: string | string[] }> }) {
  const { q, strana } = await searchParams;
  const query = first(q);
  const { customers, page, pageCount } = await searchCustomers(await currentUserWith('customers.read'), { query, page: pageOf(strana) });
  return (
    <>
      <div className="page-header">
        <h1>Zákazníci</h1>
        <Link href="/zakaznici/novy" className="button">
          Pridať zákazníka
        </Link>
      </div>
      <form role="search" action="/zakaznici" className="search">
        <Field label="Hľadať zákazníka" name="q" type="search" defaultValue={query} placeholder="Názov, IČO, e-mail alebo telefón" />
        <button type="submit">Hľadať</button>
      </form>
      {customers.length === 0 ? (
        <p>{query.trim() ? `Nič sa nenašlo pre „${query}“.` : 'Zatiaľ tu nič nie je.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Názov</th>
                <th scope="col">Typ</th>
                <th scope="col">IČO</th>
                <th scope="col">Telefón</th>
                <th scope="col">E-mail</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/zakaznici/${customer.id}`}>{customer.name}</Link>
                  </td>
                  <td>{customerTypeLabels[customer.type]}</td>
                  <td>{customer.ico}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => searchHref('/zakaznici', query, n)} />
    </>
  );
}
