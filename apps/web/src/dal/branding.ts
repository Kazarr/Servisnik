import { getDb, type Database } from '../db/index.ts';
import { workshopLogo } from '../db/schema.ts';
import type { Logo } from './logo.ts';

// What the login page and the menu show of the autoservis (ticket #150). The login page is for somebody who is not
// signed in, so these reads ask for no user and no capability: the logo is the one thing of the autoservis that is public.
// `getLogo` of logo.ts asks the capability and reads through `readLogo`.

/** The logo, or null when there is none. */
export async function readLogo(db: Database = getDb()): Promise<Logo | null> {
  const [row] = await db.select({ contentType: workshopLogo.contentType, bytes: workshopLogo.data }).from(workshopLogo);
  return row ?? null;
}

/**
 * When the logo last changed, in milliseconds, or null when there is none. It goes in the address of the image, so that a
 * replaced logo is not shown from the browser's cache, and says whether there is a logo without reading it.
 */
export async function readLogoVersion(db: Database = getDb()): Promise<number | null> {
  const [row] = await db.select({ updatedAt: workshopLogo.updatedAt }).from(workshopLogo);
  return row ? row.updatedAt.getTime() : null;
}
