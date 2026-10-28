import Link from 'next/link';
import { searchVehicles } from '../../../../dal/vehicles.ts';
import type { User } from '../../../../dal/user.ts';
import { Field } from '../../field.tsx';
import { Pager } from '../../pager.tsx';
import { searchHref } from '../../search-params.ts';
import { intakePaths } from './paths.ts';

/**
 * The start of a Príjem vozidla: the Vozidlo that came is found by the search of the list of Vozidlá, and
 * its row leads to the form of a Zákazka for it. A Vozidlo that is not there yet is a new one.
 */
export async function FindVehicle({ user, query, page }: { user: User; query: string; page: number }) {
  const { vehicles, page: current, pageCount } = await searchVehicles(user, { query, page });
  return (
    <>
      <div className="page-header">
        <h1>Nová zákazka</h1>
        <Link href={intakePaths.newVehicle} className="button">
          Nové vozidlo
        </Link>
      </div>
      <form role="search" action={intakePaths.start} className="search">
        <Field label="Hľadať vozidlo" name="q" type="search" defaultValue={query} placeholder="VIN, ŠPZ alebo meno majiteľa" />
        <button type="submit">Hľadať</button>
      </form>
      {vehicles.length === 0 ? (
        <p>{query.trim() ? `Nič sa nenašlo pre „${query}“. Vozidlo, ktoré tu nie je, založíte tlačidlom „Nové vozidlo“.` : 'Zatiaľ tu nič nie je.'}</p>
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
                <th scope="col">Zákazka</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td>{vehicle.vin}</td>
                  <td>{vehicle.licensePlate}</td>
                  <td>{vehicle.make}</td>
                  <td>{vehicle.model}</td>
                  <td>{vehicle.owner.name}</td>
                  <td>
                    <Link href={intakePaths.forVehicle(vehicle.id)}>Založiť zákazku</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={current} pageCount={pageCount} href={(n) => searchHref(intakePaths.start, query, n)} />
    </>
  );
}
