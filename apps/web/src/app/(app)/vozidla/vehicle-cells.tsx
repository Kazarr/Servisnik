import Link from 'next/link';

/** The first two cells of a table row of Vozidlá: the VIN, which links to the vehicle, and its ŠPZ. */
export function VehicleCells({ vehicle }: { vehicle: { id: string; vin: string; licensePlate: string | null } }) {
  return (
    <>
      <td>
        <Link href={`/vozidla/${vehicle.id}`}>{vehicle.vin}</Link>
      </td>
      <td>{vehicle.licensePlate}</td>
    </>
  );
}
