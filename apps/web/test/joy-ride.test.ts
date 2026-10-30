import type { EditionInput, RegistrationInput } from '@servisnik/domain/joy-ride';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createRegistration, getEdition, getRegistration, listRegistrations, saveEdition, setRegistrationStatus, updateRegistration } from '../src/dal/joy-ride.ts';
import { joyRideEdition, joyRideRegistration } from '../src/db/schema.ts';
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

// Every person, e-mail and phone here is made up: the repository is public.
const eva: RegistrationInput = {
  name: 'Eva Vzorová',
  phone: '+421 000 000 101',
  email: 'eva.vzorova@example.com',
  make: 'Škoda',
  model: '110 R',
  licensePlate: 'pb 123 ab',
  category: 'veteran',
  note: 'Príde s prívesom.',
};
const boris: RegistrationInput = { name: 'Boris Ukážkový', phone: '+421 000 000 102', email: 'boris.ukazkovy@example.com', make: 'Nissan', model: 'GT-R', category: 'supersport' };
const cyril: RegistrationInput = { name: 'Cyril Skúšobný', phone: '+421 000 000 103', email: 'cyril.skusobny@example.com', make: 'Jawa', model: '350', category: 'motorcycle' };

const register = async (input: RegistrationInput, now?: Date) => idOf(await createRegistration(admin, input, ctx.db, now));
const namesOf = async (filter: { category?: string; status?: string } = {}) => (await listRegistrations(admin, filter, ctx.db)).registrations.map(({ name }) => name);

test('a Registrácia needs a Ročník: with none the admin is told so, and nothing is saved', async () => {
  expect(await createRegistration(admin, eva, ctx.db)).toEqual({ ok: false, errors: { edition: 'missing' } });

  expect(await ctx.db.$count(joyRideRegistration)).toBe(0);
});

test('a Registrácia is saved on the current Ročník as Nová, with the day it was made in Bratislava, and listed with all it holds', async () => {
  await saveEdition(admin, edition2026, ctx.db);

  // Half past midnight in Bratislava on 31. 10. is still the 30th in UTC.
  const id = await register(eva, new Date('2026-10-30T23:30:00Z'));

  expect(await listRegistrations(admin, {}, ctx.db)).toEqual({
    filter: { category: null, status: null },
    counts: { new: 1, approved: 0, rejected: 0 },
    registrations: [
      {
        id,
        name: 'Eva Vzorová',
        phone: '+421 000 000 101',
        email: 'eva.vzorova@example.com',
        make: 'Škoda',
        model: '110 R',
        licensePlate: 'PB123AB',
        category: 'veteran',
        note: 'Príde s prívesom.',
        status: 'new',
        createdOn: '2026-10-31',
      },
    ],
  });
});

test('a Registrácia the domain refuses is not saved, and each reason comes back', async () => {
  await saveEdition(admin, edition2026, ctx.db);

  const refused = await createRegistration(admin, { ...eva, name: ' ', email: 'eva', category: 'sedan' }, ctx.db);

  expect(refused).toEqual({ ok: false, errors: { name: 'required', email: 'format', category: 'required' } });
  expect(await ctx.db.$count(joyRideRegistration)).toBe(0);
});

test('the list is the newest Registrácia first', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  await register(eva, new Date('2026-10-01T08:00:00Z'));
  await register(cyril, new Date('2026-10-03T08:00:00Z'));
  await register(boris, new Date('2026-10-02T08:00:00Z'));

  expect(await namesOf()).toEqual(['Cyril Skúšobný', 'Boris Ukážkový', 'Eva Vzorová']);
});

test('the list has only the Registrácie of the current Ročník, and so do the counts', async () => {
  await ctx.db.insert(joyRideEdition).values({ name: 'Jazda radosti 2025', date: '2025-10-18', place: 'Považská Bystrica', registrationDeadline: '2025-10-17 15:00' });
  await register(eva); // the only Ročník there is, 2025, is the current one
  await ctx.db.insert(joyRideEdition).values({ name: 'Jazda radosti 2026', date: '2026-10-10', place: 'Považská Bystrica', registrationDeadline: '2026-10-09 15:00' });

  expect(await namesOf()).toEqual([]);
  expect((await listRegistrations(admin, {}, ctx.db)).counts).toEqual({ new: 0, approved: 0, rejected: 0 });
  await register(boris);
  expect(await namesOf()).toEqual(['Boris Ukážkový']);
});

test('the list is empty and the counts are zero while there is no Ročník', async () => {
  expect(await listRegistrations(admin, {}, ctx.db)).toEqual({
    filter: { category: null, status: null },
    counts: { new: 0, approved: 0, rejected: 0 },
    registrations: [],
  });
});

test('the list is filtered by Kategória and by Stav, and by both; the counts stay those of the whole Ročník', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  const evaId = await register(eva, new Date('2026-10-01T08:00:00Z'));
  await register(boris, new Date('2026-10-02T08:00:00Z'));
  await register({ ...cyril, category: 'veteran' }, new Date('2026-10-03T08:00:00Z'));
  await ctx.db.execute(sql`update joy_ride_registration set status = 'approved' where id = ${evaId}`);

  expect(await namesOf({ category: 'veteran' })).toEqual(['Cyril Skúšobný', 'Eva Vzorová']);
  expect(await namesOf({ status: 'new' })).toEqual(['Cyril Skúšobný', 'Boris Ukážkový']);
  expect(await namesOf({ category: 'veteran', status: 'approved' })).toEqual(['Eva Vzorová']);
  expect(await namesOf({ category: 'motorcycle' })).toEqual([]);
  const filtered = await listRegistrations(admin, { category: 'veteran', status: 'approved' }, ctx.db);
  expect(filtered.filter).toEqual({ category: 'veteran', status: 'approved' });
  expect(filtered.counts).toEqual({ new: 2, approved: 1, rejected: 0 });
});

test('a filter that names no Kategória or Stav shows the whole list', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  await register(eva, new Date('2026-10-01T08:00:00Z'));
  await register(boris, new Date('2026-10-02T08:00:00Z'));

  expect(await namesOf({ category: 'sedan', status: 'maybe' })).toEqual(['Boris Ukážkový', 'Eva Vzorová']);
});

const statusOf = async (id: string) => (await getRegistration(admin, id, ctx.db))?.status;

test('a Registrácia is read by its id with all it holds, and an id that is none, or no id at all, is null', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  const id = await register(eva, new Date('2026-10-01T08:00:00Z'));

  expect(await getRegistration(admin, id, ctx.db)).toEqual({
    id,
    name: 'Eva Vzorová',
    phone: '+421 000 000 101',
    email: 'eva.vzorova@example.com',
    make: 'Škoda',
    model: '110 R',
    licensePlate: 'PB123AB',
    category: 'veteran',
    note: 'Príde s prívesom.',
    status: 'new',
    createdOn: '2026-10-01',
  });
  expect(await getRegistration(admin, '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', ctx.db)).toBeNull();
  expect(await getRegistration(admin, 'not-an-id', ctx.db)).toBeNull();
});

test('the admin approves a Registrácia, rejects it, and takes either back, and the others keep their Stav', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  const evaId = await register(eva);
  const borisId = await register(boris);

  expect(await setRegistrationStatus(admin, evaId, 'approved', ctx.db)).toEqual({ ok: true });
  expect(await statusOf(evaId)).toBe('approved');
  expect(await setRegistrationStatus(admin, evaId, 'rejected', ctx.db)).toEqual({ ok: true });
  expect(await statusOf(evaId)).toBe('rejected');
  expect(await setRegistrationStatus(admin, evaId, 'approved', ctx.db)).toEqual({ ok: true });
  expect(await statusOf(evaId)).toBe('approved');
  expect(await statusOf(borisId)).toBe('new');
  expect((await listRegistrations(admin, {}, ctx.db)).counts).toEqual({ new: 1, approved: 1, rejected: 0 });
});

test('a Registrácia that is not there cannot be approved, and nothing is changed', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  const id = await register(eva);

  expect(await setRegistrationStatus(admin, '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', 'approved', ctx.db)).toEqual({ ok: false, error: 'unknown' });
  expect(await setRegistrationStatus(admin, 'not-an-id', 'approved', ctx.db)).toEqual({ ok: false, error: 'unknown' });
  expect(await statusOf(id)).toBe('new');
});

test('the admin changes what was typed in a Registrácia, and its Stav, its Ročník and its day stay', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  const id = await register(eva, new Date('2026-10-01T08:00:00Z'));
  await setRegistrationStatus(admin, id, 'approved', ctx.db);

  const result = await updateRegistration(admin, id, { ...eva, name: ' Eva Vzorová-Nová ', model: '110 LS', licensePlate: '', note: '' }, ctx.db);

  expect(result).toEqual({ ok: true });
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ name: 'Eva Vzorová-Nová', model: '110 LS', licensePlate: null, note: null, status: 'approved', createdOn: '2026-10-01' });
  expect((await listRegistrations(admin, {}, ctx.db)).registrations).toHaveLength(1);
});

test('a change the domain refuses comes back with its reasons and leaves the Registrácia as it was', async () => {
  await saveEdition(admin, edition2026, ctx.db);
  const id = await register(eva);

  const result = await updateRegistration(admin, id, { ...eva, phone: '', email: 'eva' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { phone: 'required', email: 'format' } });
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ phone: '+421 000 000 101', email: 'eva.vzorova@example.com' });
});

test('a Registrácia that is not there cannot be changed', async () => {
  await saveEdition(admin, edition2026, ctx.db);

  expect(await updateRegistration(admin, '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', eva, ctx.db)).toEqual({ ok: false, errors: { registration: 'unknown' } });
  expect(await updateRegistration(admin, 'not-an-id', eva, ctx.db)).toEqual({ ok: false, errors: { registration: 'unknown' } });
  expect(await ctx.db.$count(joyRideRegistration)).toBe(0);
});
