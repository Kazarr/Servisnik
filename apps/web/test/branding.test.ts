import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { readLogo, readLogoVersion } from '../src/dal/branding.ts';
import { removeLogo, saveLogo } from '../src/dal/logo.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { jpeg, png } from './support/logo-files.ts';

// What the login page and the menu show of the autoservis (ticket #150): its logo, which the login page shows to
// somebody who is not signed in, so these reads ask for no user. They hold nothing but the image and when it changed.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => removeLogo(admin, ctx.db));

test('with no logo there is nothing to show: no image and no version', async () => {
  expect(await readLogo(ctx.db)).toBeNull();
  expect(await readLogoVersion(ctx.db)).toBeNull();
});

test('the logo the admin saved is read back as it is, with the type read from its content', async () => {
  await saveLogo(admin, png, ctx.db);

  expect(await readLogo(ctx.db)).toEqual({ contentType: 'image/png', bytes: png });
});

test('the version of the logo is the time it changed, so a replaced logo has another address and a removed one has none', async () => {
  await saveLogo(admin, png, ctx.db);
  const first = await readLogoVersion(ctx.db);
  expect(first).toEqual(expect.any(Number));
  expect(await readLogoVersion(ctx.db)).toBe(first); // asking again changes nothing

  await new Promise((resolve) => setTimeout(resolve, 5)); // the time has a millisecond
  await saveLogo(admin, jpeg, ctx.db);
  expect(await readLogoVersion(ctx.db)).toBeGreaterThan(first!);

  await removeLogo(admin, ctx.db);
  expect(await readLogoVersion(ctx.db)).toBeNull();
});
