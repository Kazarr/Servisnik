import type { ReactNode } from 'react';
import { currentUser } from '../../dal/current-user.ts';
import { signOut } from './actions.ts';
import { menuFor } from './menu.ts';
import { NavLink } from './nav-link.tsx';

/** Menu on the left, page on the right. Pages check the session themselves; see currentUser. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="brand">Servisník</p>
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
          <p>{user.email}</p>
          <form action={signOut}>
            <button type="submit">Odhlásiť sa</button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
