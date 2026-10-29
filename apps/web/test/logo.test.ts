import { maxLogoBytes } from '@servisnik/domain/settings';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { getLogo, getLogoInfo, removeLogo, saveLogo } from '../src/dal/logo.ts';
import { workshopLogo } from '../src/db/schema.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { gif, jpeg, padded, png, textNamedPng } from './support/logo-files.ts';

// The logo of the autoservis (GLOSSARY: Nastavenia): one small image in its own table. Who may read and write
// it is the table in dal-access.test.ts; what makes a file a logo is the domain's checkLogo.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
// Every test starts without a logo.
beforeEach(() => removeLogo(admin, ctx.db));

test('a new autoservis has no logo', async () => {
  expect(await getLogo(admin, ctx.db)).toBeNull();
  expect(await getLogoInfo(admin, ctx.db)).toBeNull();
});

test('a PNG the admin saves is what everybody who is signed in reads next, byte for byte, with its type', async () => {
  expect(await saveLogo(admin, png, ctx.db)).toEqual({ ok: true });

  const expected = { contentType: 'image/png', bytes: png };
  expect(await getLogo(admin, ctx.db)).toEqual(expected);
  expect(await getLogo(mechanic, ctx.db)).toEqual(expected);
});

test('a JPEG is kept as a JPEG', async () => {
  expect(await saveLogo(admin, jpeg, ctx.db)).toEqual({ ok: true });

  expect(await getLogo(mechanic, ctx.db)).toEqual({ contentType: 'image/jpeg', bytes: jpeg });
});

test('a logo of exactly 1 MB is kept', async () => {
  const big = padded(png, maxLogoBytes);

  expect(await saveLogo(admin, big, ctx.db)).toEqual({ ok: true });

  const kept = await getLogo(admin, ctx.db);
  expect(kept?.contentType).toBe('image/png');
  expect(kept!.bytes.byteLength).toBe(big.byteLength); // first, so that a size that differs shows its numbers
  expect(Buffer.compare(kept!.bytes, big)).toBe(0); // `toEqual` walks a million bytes one by one: seconds on an idle machine, over the limit on a busy one
});

test('a new logo replaces the one before, which leaves no second row', async () => {
  await saveLogo(admin, png, ctx.db);

  await saveLogo(admin, jpeg, ctx.db);

  expect(await getLogo(admin, ctx.db)).toEqual({ contentType: 'image/jpeg', bytes: jpeg });
  expect(await ctx.db.$count(workshopLogo)).toBe(1);
});

test('the admin removes the logo, and removing it again changes nothing', async () => {
  await saveLogo(admin, png, ctx.db);

  await removeLogo(admin, ctx.db);
  await removeLogo(admin, ctx.db);

  expect(await getLogo(admin, ctx.db)).toBeNull();
  expect(await getLogo(mechanic, ctx.db)).toBeNull();
});

test.each([
  ['a GIF', gif, 'unsupported-type'],
  ['text named .png', textNamedPng, 'unsupported-type'],
  ['an empty file', new Uint8Array(), 'unsupported-type'],
  ['a PNG a byte over 1 MB', padded(png, maxLogoBytes + 1), 'too-large'],
] as const)('%s is refused with the reason, and the logo the admin had stays', async (_what, file, error) => {
  await saveLogo(admin, jpeg, ctx.db);

  expect(await saveLogo(admin, file, ctx.db)).toEqual({ ok: false, error });

  expect(await getLogo(admin, ctx.db)).toEqual({ contentType: 'image/jpeg', bytes: jpeg });
});

test('a refused file is not saved as the first logo either', async () => {
  await saveLogo(admin, textNamedPng, ctx.db);

  expect(await getLogo(admin, ctx.db)).toBeNull();
});

test('the settings page learns whether there is a logo, its type and its size, and never loads the image', async () => {
  await saveLogo(admin, png, ctx.db);

  const info = await getLogoInfo(admin, ctx.db);

  expect(info).toEqual({ contentType: 'image/png', sizeBytes: png.length, updatedAt: expect.any(Date) });
});

test('a replaced logo has a newer time of change, which the page puts in the address of the image', async () => {
  await saveLogo(admin, png, ctx.db);
  const first = (await getLogoInfo(admin, ctx.db))!.updatedAt;
  await new Promise((resolve) => setTimeout(resolve, 5)); // a time of change has milliseconds

  await saveLogo(admin, jpeg, ctx.db);

  expect((await getLogoInfo(admin, ctx.db))!.updatedAt.getTime()).toBeGreaterThan(first.getTime());
});

// The reason for a table of its own (specification, Logo): reading the rates and the details, which is
// every visit to Nastavenia, must not carry an image along.
test('no column of workshop holds an image', async () => {
  const { rows } = await ctx.db.execute(sql`select column_name from information_schema.columns where table_name = 'workshop' and data_type = 'bytea'`);

  expect(rows).toEqual([]);
});

// The domain checks these too; the database is the last guard, and the one row of the logo must stay one.
test.each([
  ['a second row', sql`insert into workshop_logo (id, content_type, data) values (2, 'image/png', '\\x89'::bytea)`, 'workshop_logo_single_row_check'],
  ['a type that is not PNG or JPEG', sql`insert into workshop_logo (content_type, data) values ('image/gif', '\\x47'::bytea)`, 'workshop_logo_content_type_check'],
  ['an empty image', sql`insert into workshop_logo (content_type, data) values ('image/png', ''::bytea)`, 'workshop_logo_size_check'],
  ['an image over 1 MB', sql`insert into workshop_logo (content_type, data) values ('image/png', decode(repeat('00', ${maxLogoBytes + 1}), 'hex'))`, 'workshop_logo_size_check'],
])('the database refuses %s', async (_what, statement, constraint) => {
  await expect(ctx.db.execute(statement)).rejects.toMatchObject({ cause: { constraint } });

  expect(await ctx.db.$count(workshopLogo)).toBe(0);
});
