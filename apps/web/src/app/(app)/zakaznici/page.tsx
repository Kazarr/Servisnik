import type { Metadata } from 'next';
import { currentUser } from '../../../dal/current-user.ts';

export const metadata: Metadata = { title: 'Zákazníci' };

export default async function CustomersPage() {
  await currentUser();
  return (
    <>
      <h1>Zákazníci</h1>
      <p>Zatiaľ tu nič nie je.</p>
    </>
  );
}
