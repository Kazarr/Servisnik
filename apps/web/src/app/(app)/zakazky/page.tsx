import type { Metadata } from 'next';
import { currentUser } from '../../../dal/current-user.ts';

export const metadata: Metadata = { title: 'Zákazky' };

export default async function WorkOrdersPage() {
  await currentUser();
  return (
    <>
      <h1>Zákazky</h1>
      <p>Zatiaľ tu nič nie je.</p>
    </>
  );
}
