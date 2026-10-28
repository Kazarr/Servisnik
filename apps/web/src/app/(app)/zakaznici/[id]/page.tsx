import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getCustomer } from '../../../../dal/customers.ts';
import { customerTypeLabels } from '../type-labels.ts';

export const metadata: Metadata = { title: 'Zákazník' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const customer = await getCustomer(await currentUserWith('customers.read'), (await params).id);
  if (!customer) notFound();

  const details: [label: string, value: string | null][] = [
    ['Typ', customerTypeLabels[customer.type]],
    ['IČO', customer.ico],
    ['DIČ', customer.dic],
    ['IČ DPH', customer.icDph],
    ['Ulica', customer.street],
    ['Mesto', customer.city],
    ['PSČ', customer.postalCode],
    ['Telefón', customer.phone],
    ['E-mail', customer.email],
    ['Poznámka', customer.note],
  ];

  return (
    <>
      <div className="page-header">
        <h1>{customer.name}</h1>
        <Link href={`/zakaznici/${customer.id}/upravit`} className="button">
          Upraviť
        </Link>
      </div>
      <dl className="details">
        {details
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      <div className="page-header">
        <h2>Vozidlá</h2>
        <Link href={`/vozidla/novy?zakaznik=${customer.id}`} className="button">
          Pridať vozidlo
        </Link>
      </div>
      {customer.vehicles.length === 0 ? (
        <p>Zatiaľ žiadne vozidlo.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">VIN</th>
                <th scope="col">ŠPZ</th>
                <th scope="col">Značka</th>
                <th scope="col">Model</th>
              </tr>
            </thead>
            <tbody>
              {customer.vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>
                    <Link href={`/vozidla/${vehicle.id}`}>{vehicle.vin}</Link>
                  </td>
                  <td>{vehicle.licensePlate}</td>
                  <td>{vehicle.make}</td>
                  <td>{vehicle.model}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
