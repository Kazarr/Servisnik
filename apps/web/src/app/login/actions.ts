'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { tooManyAttemptsMessage } from '../../dal/attempt-limit.ts';
import { signInWithPassword } from '../../dal/sign-in.ts';

export type LoginState = { error: string; email: string } | null;

const messages = {
  refused: 'Nesprávny e-mail alebo heslo.',
  tooManyAttempts: tooManyAttemptsMessage,
};

/** Server Action of the login form. It is public by nature: it is how a session starts. */
export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const result = await signInWithPassword(await headers(), { email, password });
  if (!result.ok) return { error: messages[result.reason], email };
  redirect('/');
}
