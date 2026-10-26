import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { requireUser, UnauthenticatedError } from './user.ts';

/**
 * For pages and layouts: the signed-in Používateľ, or a redirect to the login page. Every page calls
 * it itself, because a layout does not run again when the user navigates between pages.
 */
export const currentUser = cache(async () => {
  try {
    return await requireUser(await headers());
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/login');
    throw error;
  }
});
