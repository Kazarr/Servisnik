import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUserWith } from '../../../../../dal/current-user.ts';
import { getUser } from '../../../../../dal/users.ts';
import { statusLabel } from '../../status-label.ts';
import { UserEditForm } from '../../user-edit-form.tsx';
import { userMessages } from '../../user-messages.ts';
import { UserPasswordForm } from '../../user-password-form.tsx';
import { UserStatusForm } from '../../user-status-form.tsx';

export const metadata: Metadata = { title: 'Upraviť používateľa' };

/**
 * The page of one Používateľ in Nastavenia, for the admin: his name, e-mail and Rola, a new password,
 * and the state (Aktívny or Deaktivovaný). On the admin's own page there is no field for his Rola,
 * no new password (he changes his own from the link at his e-mail) and no deactivation; the server
 * refuses the first and the last as well.
 */
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserWith('users.write');
  const target = await getUser(user, (await params).id);
  if (!target) notFound();

  const own = target.id === user.id;
  return (
    <>
      <h1>Upraviť používateľa</h1>
      <p>
        <Link href="/nastavenia">Späť na Nastavenia</Link>
      </p>
      <section aria-labelledby="user-data-heading" className="settings-section">
        <h2 id="user-data-heading">Údaje používateľa</h2>
        <UserEditForm userId={target.id} initial={{ name: target.name, email: target.email, role: target.role }} ownRole={own ? target.role : undefined} />
      </section>
      {!own && (
        <section aria-labelledby="user-password-heading" className="settings-section">
          <h2 id="user-password-heading">Nové heslo</h2>
          <UserPasswordForm userId={target.id} />
        </section>
      )}
      <section aria-labelledby="user-status-heading" className="settings-section">
        <h2 id="user-status-heading">Stav</h2>
        <p>{statusLabel(target.banned)}</p>
        {own ? <p>{userMessages.deactivateSelf}.</p> : <UserStatusForm userId={target.id} banned={target.banned} />}
      </section>
    </>
  );
}
