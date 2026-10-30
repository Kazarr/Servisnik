import type { Metadata } from 'next';
import { currentUserWith } from '../../../../dal/current-user.ts';
import { getEdition } from '../../../../dal/joy-ride.ts';
import { EditionForm } from '../edition-form.tsx';

export const metadata: Metadata = { title: 'Ročník Jazdy radosti' };

export default async function EditionPage() {
  const user = await currentUserWith('joy-ride.write');
  const edition = await getEdition(user);

  return (
    <>
      <h1>{edition ? 'Upraviť ročník' : 'Zadať ročník'}</h1>
      <EditionForm edition={edition} />
    </>
  );
}
