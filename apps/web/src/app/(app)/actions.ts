'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '../../auth.ts';

/** Ends the session on the server (the cookie alone would stay valid until it expires), then back to the login. */
export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect('/login');
}
