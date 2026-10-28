import type { Metadata } from 'next';
import { currentUserWith } from '../../../dal/current-user.ts';
import { PasswordForm } from './password-form.tsx';

export const metadata: Metadata = { title: 'Zmena hesla' };

/** `?zmenene` is where the form sends the user after the password was changed (actions.ts). */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ zmenene?: string }> }) {
  await currentUserWith('password.change'); // the form reads no data, so only this check sends a Rola without the capability away
  const { zmenene } = await searchParams;
  return (
    <>
      <h1>Zmena hesla</h1>
      {zmenene !== undefined && <p role="status">Heslo bolo zmenené. Ostatné prihlásenia sú odhlásené.</p>}
      <PasswordForm />
    </>
  );
}
