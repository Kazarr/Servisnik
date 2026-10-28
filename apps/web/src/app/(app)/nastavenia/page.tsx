import type { Metadata } from 'next';
import { currentUserWith } from '../../../dal/current-user.ts';
import { LogoSection } from './logo-section.tsx';
import { RatesSection } from './rates-section.tsx';

export const metadata: Metadata = { title: 'Nastavenia' };

/**
 * Nastavenia, for the admin: one section under another, each with its own heading, form and Server
 * Actions. A part of Nastavenia is a `<section className="settings-section">` in a file of its own
 * (like rates-section.tsx) and a line here.
 */
export default async function SettingsPage() {
  const user = await currentUserWith('settings.read');
  return (
    <>
      <h1>Nastavenia</h1>
      <LogoSection user={user} />
      <RatesSection user={user} />
    </>
  );
}
