import type { Metadata } from 'next';
import { currentUser } from '../../../dal/current-user.ts';

export const metadata: Metadata = { title: 'Vozidlá' };

export default async function VehiclesPage() {
  await currentUser();
  return (
    <>
      <h1>Vozidlá</h1>
      <p>Zatiaľ tu nič nie je.</p>
    </>
  );
}
