import { can, type Capability } from '@servisnik/domain/access';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { homePage, requireUser, UnauthenticatedError } from './user.ts';

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
 * sent to Zákazky, the page every Rola may open. The DAL functions the page then calls check their own
 * capability again; one that throws ForbiddenError sends the user to Zákazky too, never shows data.
 */
export async function currentUserWith(capability: Capability) {
  const user = await currentUser();
  if (!can(user.role, capability)) redirect(homePage);
  return user;
}
