'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '../../auth.ts';

export type LoginState = { error: string; email: string } | null;

/** Server Action of the login form. It is public by nature: it is how a session starts. */
export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    // A rejected login is the user's problem; anything else (database down, bug) must stay a server error.
    if (error instanceof APIError && error.statusCode < 500) return { error: 'Nesprávny e-mail alebo heslo.', email };
    throw error;
  }
  redirect('/');
}
