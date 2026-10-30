import { can } from '@servisnik/domain/access';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { readLogoVersion } from '../../dal/branding.ts';
import { currentUser } from '../../dal/current-user.ts';
import { getWorkshopDetails } from '../../dal/workshop.ts';
import { productName } from '../../product.ts';
import { PoweredBy } from '../powered-by.tsx';
import { signOut } from './actions.ts';
import { menuFor, ownPassword } from './menu.ts';
import { NavLink } from './nav-link.tsx';

/** Menu on the left, page on the right. Pages check the session themselves; see currentUser. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const [{ name }, logoVersion] = await Promise.all([getWorkshopDetails(user), readLogoVersion()]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {logoVersion === null ? (
            <p className="brand-text">{productName}</p>
          ) : (
            <>
              {/* The time of the change is in the address, so that a replaced logo is not shown from the browser's cache. */}
              <img className="brand-logo" src={`/api/logo?v=${logoVersion}`} alt={name ? '' : 'Logo autoservisu'} />
              {name && <p className="brand-name">{name}</p>}
            </>
          )}
        </div>
        <nav aria-label="Hlavné menu">
          <ul className="menu">
            {menuFor(user.role).map(({ href, label }) => (
              <li key={href}>
                <NavLink href={href}>{label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="user">
          <p>
            {can(user.role, ownPassword.capability) ? (
              <Link href={ownPassword.href} title="Zmeniť heslo">
                {user.email}
              </Link>
            ) : (
              user.email
            )}
          </p>
          <form action={signOut}>
            <button type="submit">Odhlásiť sa</button>
          </form>
        </div>
        <PoweredBy />
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
