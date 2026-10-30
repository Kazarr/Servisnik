import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../../dal/current-user.ts';
import { getRegistration } from '../../../../../../dal/joy-ride.ts';
import { RegistrationForm } from '../../../registration-form.tsx';

export const metadata: Metadata = { title: 'Upraviť registráciu' };

export default async function EditRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('joy-ride.write');
  const registration = await getRegistration(user, (await params).id);
  if (!registration) notFound();

  return (
    <>
      <h1>Upraviť registráciu</h1>
      <RegistrationForm registration={{ ...registration, licensePlate: registration.licensePlate ?? '', note: registration.note ?? '' }} />
    </>
  );
}
