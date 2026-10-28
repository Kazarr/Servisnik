'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '../../auth.ts';
import { signInWithPassword } from './sign-in.ts';

export type LoginState = { error: string; email: string } | null;

/** Server Action of the login form. It is public by nature: it is how a session starts. */
export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const result = await signInWithPassword(getAuth(), await headers(), email, password);
  if (!result.ok) return { error: result.message, email };
  redirect('/');
}
