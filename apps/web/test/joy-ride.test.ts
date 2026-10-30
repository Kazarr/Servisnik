import type { EditionInput } from '@servisnik/domain/joy-ride';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { getEdition, saveEdition } from '../src/dal/joy-ride.ts';
import { joyRideEdition } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

// The Jazda radosti (ticket #153): one current Ročník the admin edits, and the Registrácie of it. Who may read or write it is in dal-access.test.ts.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate joy_ride_edition cascade`);
});

const edition2026: EditionInput = { name: 'Jazda radosti 2026', date: '2026-10-10', place: 'Považská Bystrica, centrum', registrationDeadline: '2026-10-09T15:00' };
const rowCount = async () => ctx.db.$count(joyRideEdition);

test('there is no Ročník until the admin saves one', async () => {
  expect(await getEdition(admin, ctx.db)).toBeNull();
});

test('the first save makes the Ročník, and it is read back with its day, place and the uzávierka registrácií as the form has them', async () => {
  const id = idOf(await saveEdition(admin, edition2026, ctx.db));

  expect(await getEdition(admin, ctx.db)).toEqual({ id, ...edition2026 });
});

test('a later save changes the Ročník that is there, so there is still one', async () => {
  const id = idOf(await saveEdition(admin, edition2026, ctx.db));

  const again = await saveEdition(admin, { ...edition2026, name: '  Jazda radosti 2026 (3. ročník) ', place: 'Považská Bystrica', registrationDeadline: '2026-10-09T12:30' }, ctx.db);

  expect(idOf(again)).toBe(id);
  expect(await rowCount()).toBe(1);
  expect(await getEdition(admin, ctx.db)).toEqual({
    id,
    name: 'Jazda radosti 2026 (3. ročník)',
    date: '2026-10-10',
    place: 'Považská Bystrica',
    registrationDeadline: '2026-10-09T12:30',
  });
});

test('a Ročník the domain refuses is not saved, and each reason comes back', async () => {
  const refused = await saveEdition(admin, { name: '', date: '2026-02-30', place: ' ', registrationDeadline: '' }, ctx.db);

  expect(refused).toEqual({ ok: false, errors: { name: 'required', date: 'invalid', place: 'required', registrationDeadline: 'required' } });
  expect(await rowCount()).toBe(0);
});

test('a Ročník that is refused leaves the one that is there as it was', async () => {
  await saveEdition(admin, edition2026, ctx.db);

  await saveEdition(admin, { ...edition2026, name: '' }, ctx.db);

  expect(await getEdition(admin, ctx.db)).toMatchObject(edition2026);
});

// The section keeps one Ročník and no history yet (ticket #153, "mimo dema"), but the data allows more: the current one is the latest by its day.
test('with two Ročníky in the database the current one is the one with the later day, and a save changes that one and leaves the other', async () => {
  await ctx.db.insert(joyRideEdition).values({ name: 'Jazda radosti 2025', date: '2025-10-18', place: 'Považská Bystrica', registrationDeadline: '2025-10-17 15:00' });
  const [inserted] = await ctx.db
    .insert(joyRideEdition)
    .values({ name: 'Jazda radosti 2026', date: '2026-10-10', place: 'Považská Bystrica', registrationDeadline: '2026-10-09 15:00' })
    .returning({ id: joyRideEdition.id });
  const latest = inserted!.id;
  await ctx.db.insert(joyRideEdition).values({ name: 'Jazda radosti 2024', date: '2024-10-19', place: 'Považská Bystrica', registrationDeadline: '2024-10-18 15:00' });

  expect(await getEdition(admin, ctx.db)).toMatchObject({ id: latest, name: 'Jazda radosti 2026' });
  expect(idOf(await saveEdition(admin, { ...edition2026, place: 'Pri radnici' }, ctx.db))).toBe(latest);

  expect(await rowCount()).toBe(3);
  expect(await ctx.db.select({ name: joyRideEdition.name, place: joyRideEdition.place }).from(joyRideEdition).orderBy(joyRideEdition.name)).toEqual([
    { name: 'Jazda radosti 2024', place: 'Považská Bystrica' },
    { name: 'Jazda radosti 2025', place: 'Považská Bystrica' },
    { name: 'Jazda radosti 2026', place: 'Pri radnici' },
  ]);
});
