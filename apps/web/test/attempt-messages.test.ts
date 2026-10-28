import { expect, test, vi } from 'vitest';
import { changePassword } from '../src/app/(app)/heslo/actions.ts';
import { signIn } from '../src/app/login/actions.ts';

// What the two Server Actions that check a password tell a client whose attempts the limit turned away
// (test/attempt-limit.test.ts proves the limit itself): the message, and Better Auth never asked.

// The limit says no, whatever the client; the real limit is the other file's. The rest of the module is real.
vi.mock('../src/dal/attempt-limit.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/dal/attempt-limit.ts')>()), withinAttemptLimit: async () => false }));

// Better Auth is a stand-in that knows the session of a mechanik and fails the test when asked to check a password.
const { checksPassword, auth } = vi.hoisted(() => {
  const checksPassword = vi.fn();
  const session = { user: { id: 'user-2', email: 'mechanik@autoservis.test', name: 'Mechanik', role: 'mechanik' } };
  return { checksPassword, auth: { api: { getSession: async () => session, signInEmail: checksPassword, changePassword: checksPassword } } };
});
vi.mock('../src/auth.ts', () => ({ getAuth: () => auth }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).mechanic }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const message = 'Príliš veľa pokusov. Skúste to znova o chvíľu.';

test('the login tells the client who made too many attempts so, keeps the e-mail he typed and checks no password', async () => {
  const answer = await signIn(null, form({ email: 'jan@autoservis.test', password: 'spravne-heslo-1234' }));

  expect(answer).toEqual({ error: message, email: 'jan@autoservis.test' });
  expect(checksPassword).not.toHaveBeenCalled();
});

test('the change of the password tells the client who made too many attempts so, on the form, and checks no password', async () => {
  const answer = await changePassword(null, form({ currentPassword: 'povodne-heslo-1234', newPassword: 'nove-heslo-5678', confirmation: 'nove-heslo-5678' }));

  expect(answer).toEqual({ errors: { form: message } });
  expect(checksPassword).not.toHaveBeenCalled();
});
