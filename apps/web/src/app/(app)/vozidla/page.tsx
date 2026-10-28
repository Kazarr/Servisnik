import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUserWith } from '../../../dal/current-user.ts';
import { listVehicles } from '../../../dal/vehicles.ts';
import { VehicleCells } from './vehicle-cells.tsx';

export const metadata: Metadata = { title: 'Vozidlá' };

export default async function VehiclesPage() {
  const vehicles = await listVehicles(await currentUserWith('vehicles.read'));
  return (
    <>
      <div className="page-header">
        <h1>Vozidlá</h1>
        <Link href="/vozidla/novy" className="button">
          Pridať vozidlo
        </Link>
      </div>
      {vehicles.length === 0 ? (
        <p>Zatiaľ tu nič nie je.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">VIN</th>
                <th scope="col">ŠPZ</th>
                <th scope="col">Majiteľ</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <VehicleCells vehicle={vehicle} />
                  <td>{vehicle.owner.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
