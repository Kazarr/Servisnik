import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { searchVehicles } from '../../../dal/vehicles.ts';
import { Field } from '../field.tsx';
import { Pager } from '../pager.tsx';
import { first, pageOf, searchHref } from '../search-params.ts';
import { VehicleCells } from './vehicle-cells.tsx';

export const metadata: Metadata = { title: 'Vozidlá' };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; strana?: string | string[] }> }) {
  const { q, strana } = await searchParams;
  const query = first(q);
  const { vehicles, page, pageCount } = await searchVehicles(await currentUserWith('vehicles.read'), { query, page: pageOf(strana) });
  return (
    <>
      <div className="page-header">
        <h1>Vozidlá</h1>
        <Link href="/vozidla/novy" className="button">
          Pridať vozidlo
        </Link>
      </div>
      <form role="search" action="/vozidla" className="search">
        <Field label="Hľadať vozidlo" name="q" type="search" defaultValue={query} placeholder="VIN, ŠPZ alebo meno majiteľa" />
        <button type="submit">Hľadať</button>
      </form>
      {vehicles.length === 0 ? (
        <p>{query.trim() ? `Nič sa nenašlo pre „${query}“.` : 'Zatiaľ tu nič nie je.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">VIN</th>
                <th scope="col">ŠPZ</th>
                <th scope="col">Značka</th>
                <th scope="col">Model</th>
                <th scope="col">Majiteľ</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <VehicleCells vehicle={vehicle} />
                  <td>{vehicle.make}</td>
                  <td>{vehicle.model}</td>
                  <td>{vehicle.owner.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageCount={pageCount} href={(n) => searchHref('/vozidla', query, n)} />
    </>
  );
}
