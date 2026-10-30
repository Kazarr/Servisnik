import type { Metadata } from 'next';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { RegistrationForm } from '../../registration-form.tsx';

export const metadata: Metadata = { title: 'Nová registrácia' };

export default async function NewRegistrationPage() {
  await currentUserWith('joy-ride.write'); // the form itself reads no data, so the DAL would not refuse a mechanik before the save
  return (
    <>
      <h1>Nová registrácia</h1>
      <RegistrationForm />
    </>
  );
}
