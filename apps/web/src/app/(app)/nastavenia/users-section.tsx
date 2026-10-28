import { listUsers } from '../../../dal/users.ts';
import type { User } from '../../../dal/user.ts';
import { roleLabels } from './role-labels.ts';
import { UserForm } from './user-form.tsx';

/** Používatelia: who may sign in, with their Rola and state, ordered by name, and the form for a new one. */
export async function UsersSection({ user }: { user: User }) {
  const users = await listUsers(user);
  return (
    <section aria-labelledby="users-heading" className="settings-section">
      <h2 id="users-heading">Používatelia</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Meno</th>
              <th scope="col">E-mail</th>
              <th scope="col">Rola</th>
              <th scope="col">Stav</th>
            </tr>
          </thead>
          <tbody>
            {users.map(({ id, name, email, role, banned }) => (
              <tr key={id}>
                <td>{name}</td>
                <td>{email}</td>
                <td>{roleLabels[role]}</td>
                <td>{banned ? 'Deaktivovaný' : 'Aktívny'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Založiť používateľa</h3>
      <UserForm />
    </section>
  );
}
