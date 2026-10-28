import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { listCustomers } from '../../../dal/customers.ts';
import { customerTypeLabels } from './type-labels.ts';

export const metadata: Metadata = { title: 'Zákazníci' };

export default async function CustomersPage() {
  const customers = await listCustomers(await currentUserWith('customers.read'));
  return (
    <>
      <div className="page-header">
        <h1>Zákazníci</h1>
        <Link href="/zakaznici/novy" className="button">
          Pridať zákazníka
        </Link>
      </div>
      {customers.length === 0 ? (
        <p>Zatiaľ tu nič nie je.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Názov</th>
                <th scope="col">Typ</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/zakaznici/${customer.id}`}>{customer.name}</Link>
                  </td>
                  <td>{customerTypeLabels[customer.type]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
