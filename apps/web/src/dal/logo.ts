import { checkLogo, type LogoContentType, type LogoError } from '@servisnik/domain/settings';
import { sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { workshopLogo } from '../db/schema.ts';
import { readLogo } from './branding.ts';
import { assertCan, type User } from './user.ts';

// The logo of the Autoservis lives in the one row of `workshop_logo` (src/db/schema.ts), apart from the
// other values of Nastavenia so that reading those never loads the image.

export type Logo = { contentType: LogoContentType; bytes: Uint8Array };
export type LogoInfo = { contentType: LogoContentType; sizeBytes: number; updatedAt: Date };
export type SaveLogoResult = { ok: true } | { ok: false; error: LogoError };

/**
 * The logo for print, or null when there is none. Every signed-in Používateľ may read it, the mechanik
 * too: the forms he prints carry it. The image route and the login page read it without a user, through
 * `readLogo` of branding.ts.
 */
export async function getLogo(user: User | null, db: Database = getDb()): Promise<Logo | null> {
  assertCan(user, 'workshop.read');
  return readLogo(db);
}

/** What Nastavenia shows about the logo, without the image itself; null when there is none. */
export async function getLogoInfo(user: User | null, db: Database = getDb()): Promise<LogoInfo | null> {
  assertCan(user, 'settings.read');
  const [row] = await db
    .select({ contentType: workshopLogo.contentType, sizeBytes: sql<number>`octet_length(${workshopLogo.data})`, updatedAt: workshopLogo.updatedAt })
    .from(workshopLogo);
  return row ?? null;
}

/**
 * Replaces the logo with `bytes` when the domain accepts them (packages/domain/src/settings/logo.ts),
 * and otherwise says why not and leaves the logo as it was. Only the admin may.
 */
export async function saveLogo(user: User | null, bytes: Uint8Array, db: Database = getDb()): Promise<SaveLogoResult> {
  assertCan(user, 'settings.write');
  const checked = checkLogo(bytes);
  if (!checked.ok) return checked;
  const logo = { contentType: checked.contentType, data: bytes };
  await db.insert(workshopLogo).values(logo).onConflictDoUpdate({ target: workshopLogo.id, set: logo });
  return { ok: true };
}

/** Removes the logo; when there is none it changes nothing. Only the admin may. */
export async function removeLogo(user: User | null, db: Database = getDb()): Promise<void> {
  assertCan(user, 'settings.write');
  await db.delete(workshopLogo);
}
