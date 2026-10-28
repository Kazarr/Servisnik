import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getCustomer, searchCustomers } from '../../../../dal/customers.ts';
import type { User } from '../../../../dal/user.ts';
import { Field } from '../../field.tsx';
import { Pager } from '../../pager.tsx';
import { first, pageOf, searchHref } from '../../search-params.ts';
import { customerTypeLabels } from '../../zakaznici/type-labels.ts';
import { addVehicle } from '../actions.ts';
import { VehicleForm } from '../vehicle-form.tsx';

export const metadata: Metadata = { title: 'Nové vozidlo' };

/** Before the form: the Majiteľ is found by the same search as on the list of Zákazníci, and picking one opens the form for him. */
async function PickOwner({ user, query, page }: { user: User; query: string; page: number }) {
  const { customers, page: current, pageCount } = await searchCustomers(user, { query, page });
  return (
    <>
      <h1>Nové vozidlo</h1>
      <form role="search" action="/vozidla/novy" className="search">
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
                    <Link href={`/vozidla/novy?zakaznik=${customer.id}`}>{customer.name}</Link>
                  </td>
                  <td>{customerTypeLabels[customer.type]}</td>
                  <td>{customer.ico}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={current} pageCount={pageCount} href={(n) => searchHref('/vozidla/novy', query, n)} />
    </>
  );
}

/** `?zakaznik=<id>` names the Majiteľ the form is opened for, as the button on a customer's detail does; without it the owner is searched for. */
export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ zakaznik?: string | string[]; q?: string | string[]; strana?: string | string[] }>;
}) {
  const user = await currentUserWith('vehicles.write');
  const { zakaznik, q, strana } = await searchParams;
  if (zakaznik === undefined) return <PickOwner user={user} query={first(q)} page={pageOf(strana)} />;

  const owner = typeof zakaznik === 'string' ? await getCustomer(user, zakaznik) : null;
  if (!owner) notFound();
  return (
    <>
      <h1>Nové vozidlo</h1>
      <p>
        Majiteľ: <strong>{owner.name}</strong> · <Link href="/vozidla/novy">Zmeniť majiteľa</Link>
      </p>
      <VehicleForm action={addVehicle} ownerId={owner.id} />
    </>
  );
}
