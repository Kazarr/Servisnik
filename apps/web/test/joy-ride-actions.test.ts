import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { addRegistration, decideRegistration, editRegistration, saveEditionAction } from '../src/app/(app)/jazda-radosti/actions.ts';
import { createRegistration, getEdition, getRegistration, listRegistrations, saveEdition } from '../src/dal/joy-ride.ts';
import type { Database } from '../src/db/index.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { digestOf } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { idOf } from './support/id-of.ts';

// The Server Actions of the Jazda radosti, called as the admin's forms call them: what they answer for a form that cannot be saved, and where a
// saved one leads. What they answer a mechanik is in forbidden.test.ts. The DAL is the real one, over the database of this file.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));
// A saved form asks Next.js to draw the page again, which outside a request has nothing to do.
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate joy_ride_edition cascade`);
});

const edition = { name: 'Jazda radosti 2026', date: '2026-10-10', place: 'Považská Bystrica, centrum', registrationDeadline: '2026-10-09T15:00' };
// Every person, e-mail and phone here is made up: the repository is public.
const eva = { name: 'Eva Vzorová', phone: '+421 000 000 101', email: 'eva.vzorova@example.com', make: 'Škoda', model: '110 R', licensePlate: 'PB123AB', category: 'veteran', note: '' };

const registrations = async () => (await listRegistrations(admin, {}, ctx.db)).registrations;

test('the admin saves the Ročník and goes back to the Jazda radosti', async () => {
  const digest = await digestOf(saveEditionAction(null, form(edition)));

  expect(digest).toMatch(/^NEXT_REDIRECT;.*\/jazda-radosti;/);
  expect(await getEdition(admin, ctx.db)).toMatchObject(edition);
});

test('a Ročník the domain refuses comes back to the form with the reason at each field and what was typed, and is not saved', async () => {
  const typed = { name: ' ', date: '10. 10. 2026', place: '', registrationDeadline: '2026-10-09 15:00' };

  const answer = await saveEditionAction(null, form(typed));

  expect(answer).toEqual({
    values: typed,
    errors: { name: 'Vyplňte názov ročníka', date: 'Zadajte dátum konania ako platný dátum', place: 'Vyplňte miesto konania', registrationDeadline: 'Zadajte uzávierku ako platný dátum a čas' },
  });
  expect(await getEdition(admin, ctx.db)).toBeNull();
});

test('a Ročník with nothing typed asks for each value', async () => {
  const answer = await saveEditionAction(null, form({ name: '', date: '', place: '', registrationDeadline: '' }));

  expect(answer).toEqual({
    values: { name: '', date: '', place: '', registrationDeadline: '' },
    errors: { name: 'Vyplňte názov ročníka', date: 'Zadajte dátum konania', place: 'Vyplňte miesto konania', registrationDeadline: 'Zadajte uzávierku registrácií, deň aj hodinu' },
  });
});

test('the admin adds a Registrácia and goes back to the Jazda radosti, where it is Nová', async () => {
  await saveEdition(admin, edition, ctx.db);

  const digest = await digestOf(addRegistration(null, form(eva)));

  expect(digest).toMatch(/^NEXT_REDIRECT;.*\/jazda-radosti;/);
  expect(await registrations()).toMatchObject([{ name: 'Eva Vzorová', licensePlate: 'PB123AB', category: 'veteran', status: 'new' }]);
});

test('a Registrácia the domain refuses comes back with the reason at each field and what was typed, and is not saved', async () => {
  await saveEdition(admin, edition, ctx.db);
  const typed = { name: '', phone: ' ', email: 'eva', make: '', model: '', licensePlate: 'pb 1', category: '', note: 'Poznámka' };

  const answer = await addRegistration(null, form(typed));

  expect(answer).toEqual({
    values: typed,
    errors: {
      name: 'Vyplňte meno',
      phone: 'Vyplňte telefón',
      email: 'Zadajte e-mail v tvare meno@domena.sk',
      make: 'Vyplňte značku vozidla',
      model: 'Vyplňte model',
      category: 'Vyberte kategóriu',
    },
  });
  expect(await registrations()).toEqual([]);
});

test('a missing e-mail is asked for, which is not the same as one in the wrong shape', async () => {
  await saveEdition(admin, edition, ctx.db);

  const answer = await addRegistration(null, form({ ...eva, email: '' }));

  expect(answer).toMatchObject({ errors: { email: 'Vyplňte e-mail' } });
});

test('a Registrácia sent while there is no Ročník is told so on the form, with what was typed', async () => {
  const answer = await addRegistration(null, form(eva));

  expect(answer).toEqual({ values: eva, errors: { form: 'Najprv zadajte ročník Jazdy radosti' } });
});

test('the admin changes a Registrácia and goes back to the Jazda radosti', async () => {
  await saveEdition(admin, edition, ctx.db);
  const id = idOf(await createRegistration(admin, eva, ctx.db));

  const digest = await digestOf(editRegistration(null, form({ ...eva, id, model: '110 LS' })));

  expect(digest).toMatch(/^NEXT_REDIRECT;.*\/jazda-radosti;/);
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ model: '110 LS' });
});

test('a change the domain refuses comes back to the form with its reasons, and the Registrácia is as it was', async () => {
  await saveEdition(admin, edition, ctx.db);
  const id = idOf(await createRegistration(admin, eva, ctx.db));

  const answer = await editRegistration(null, form({ ...eva, id, name: '', model: 'Fabia' }));

  expect(answer).toEqual({ values: { ...eva, name: '', model: 'Fabia' }, errors: { name: 'Vyplňte meno' } });
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ name: 'Eva Vzorová', model: '110 R' });
});

test('a Registrácia that is not there is a page that does not exist', async () => {
  await saveEdition(admin, edition, ctx.db);

  const digest = await digestOf(editRegistration(null, form({ ...eva, id: '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10' })));

  expect(digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
});

test('one click approves or rejects a Registrácia, and the answer is that there is nothing to say', async () => {
  await saveEdition(admin, edition, ctx.db);
  const id = idOf(await createRegistration(admin, eva, ctx.db));

  expect(await decideRegistration(null, form({ registrationId: id, status: 'approved' }))).toBeNull();
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ status: 'approved' });
  expect(await decideRegistration(null, form({ registrationId: id, status: 'rejected' }))).toBeNull();
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ status: 'rejected' });
});

test('a click that names no Stav of a decision, or a Registrácia that is not there, is a page that does not exist, and changes nothing', async () => {
  await saveEdition(admin, edition, ctx.db);
  const id = idOf(await createRegistration(admin, eva, ctx.db));

  expect(await digestOf(decideRegistration(null, form({ registrationId: id, status: 'maybe' })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await digestOf(decideRegistration(null, form({ registrationId: id, status: 'new' })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await digestOf(decideRegistration(null, form({ registrationId: '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', status: 'approved' })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await getRegistration(admin, id, ctx.db)).toMatchObject({ status: 'new' });
});
