import { can, type Capability } from '@servisnik/domain/access';
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

/**
 * For a page that needs a capability: like currentUser, and a Používateľ whose Rola may not do it is
 * sent to Zákazky, the page every Rola may open. The DAL checks the same capability again, so a page
 * that names the wrong one shows an error page and no data.
 */
export async function currentUserWith(capability: Capability) {
  const user = await currentUser();
  if (!can(user.role, capability)) redirect('/zakazky');
  return user;
}
