import { vatPayerTypes, type WorkshopDetails, type WorkshopDetailsInput } from '@servisnik/domain/workshop';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { getRates, saveRates } from '../src/dal/settings.ts';
import { ForbiddenError } from '../src/dal/user.ts';
import { getVatPayerType, getWorkshopDetails, saveWorkshopDetails } from '../src/dal/workshop.ts';
import { workshop } from '../src/db/schema.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { findPriceKeys } from './support/price-keys.ts';

// Údaje autoservisu (GLOSSARY): the details printed on documents, with the platiteľ DPH. The details are read by every signed-in
// user and written by the admin only; the table in dal-access.test.ts proves that for every function, these tests prove the flows.

/** The row as the migration creates it: nothing filled in, the platiteľ DPH a platiteľ. */
const startingDetails: WorkshopDetails = {
  name: '',
  street: null,
  city: null,
  postalCode: null,
  ico: null,
  dic: null,
  icDph: null,
  vatPayerType: 'payer',
  iban: null,
  phone: null,
  email: null,
  commercialRegister: null,
};
const typed: WorkshopDetailsInput = {
  name: ' Autoservis Novák s.r.o. ',
  street: 'Hlavná 1',
  city: 'Bratislava',
  postalCode: '811 01',
  ico: '12345678',
  dic: '2020123456',
  icDph: 'SK2020123456',
  vatPayerType: 'payer',
  iban: 'sk31 1200 0000 1987 4263 7541',
  phone: '+421 905 123 456',
  email: 'info@novak.sk',
  commercialRegister: 'Okresný súd Bratislava I, oddiel Sro, vložka 12345/B',
};
/** The form with every field left empty. */
const blank: WorkshopDetailsInput = {
  name: '',
  street: '',
  city: '',
  postalCode: '',
  ico: '',
  dic: '',
  icDph: '',
  vatPayerType: 'payer',
  iban: '',
  phone: '',
  email: '',
  commercialRegister: '',
};
const savedDetails: WorkshopDetails = { ...typed, name: 'Autoservis Novák s.r.o.', postalCode: '81101', iban: 'SK3112000000198742637541', vatPayerType: 'payer' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let migrated: { rows: number; details: WorkshopDetails; vatPayerType: string };
beforeAll(async () => {
  ctx = await createTestDb();
  migrated = { rows: await ctx.db.$count(workshop), details: await getWorkshopDetails(admin, ctx.db), vatPayerType: await getVatPayerType(admin, ctx.db) };
});
afterAll(() => ctx.close());
// Every test starts from the details the migration created.
beforeEach(async () => {
  await ctx.db.update(workshop).set(startingDetails);
});

test('a new database has the one row of the autoservis with no details filled in and the platiteľ DPH a platiteľ', () => {
  expect(migrated).toEqual({ rows: 1, details: startingDetails, vatPayerType: 'payer' });
});

test('details the admin saves are what everybody reads next, the mechanik too, and the platiteľ DPH on its own', async () => {
  const result = await saveWorkshopDetails(admin, typed, ctx.db);

  expect(result).toEqual({ ok: true, details: savedDetails });
  expect(await getWorkshopDetails(admin, ctx.db)).toEqual(savedDetails);
  expect(await getWorkshopDetails(mechanic, ctx.db)).toEqual(savedDetails);
  expect(await getVatPayerType(admin, ctx.db)).toBe('payer');
  expect(await getVatPayerType(mechanic, ctx.db)).toBe('payer');
  expect(await ctx.db.$count(workshop)).toBe(1);
});

test('only the name is needed, and saving again replaces every field: one that is cleared is nothing again', async () => {
  await saveWorkshopDetails(admin, typed, ctx.db);

  const result = await saveWorkshopDetails(admin, { ...blank, name: 'Nový názov', vatPayerType: 'nonPayer' }, ctx.db);

  const expected = { ...startingDetails, name: 'Nový názov', vatPayerType: 'nonPayer' };
  expect(result).toEqual({ ok: true, details: expected });
  expect(await getWorkshopDetails(admin, ctx.db)).toEqual(expected);
});

test('details that break a rule are not saved, and every reason comes back', async () => {
  const result = await saveWorkshopDetails(admin, { ...typed, name: ' ', ico: '1', iban: 'SK3112000000198742637542', icDph: '' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required', ico: 'format', iban: 'invalid', icDph: 'required' } });
  expect(await getWorkshopDetails(admin, ctx.db)).toEqual(startingDetails);
});

test('a platiteľ DPH without an IČ DPH is refused with the reason, and the same details are saved as neplatiteľ DPH', async () => {
  const withoutIcDph = { ...typed, icDph: '' };

  expect(await saveWorkshopDetails(admin, withoutIcDph, ctx.db)).toEqual({ ok: false, errors: { icDph: 'required' } });
  expect(await getWorkshopDetails(admin, ctx.db)).toEqual(startingDetails);

  expect(await saveWorkshopDetails(admin, { ...withoutIcDph, vatPayerType: 'nonPayer' }, ctx.db)).toMatchObject({ ok: true, details: { icDph: null, vatPayerType: 'nonPayer' } });
});

test.each(vatPayerTypes)('the platiteľ DPH %s is stored and read back as it is', async (vatPayerType) => {
  await saveWorkshopDetails(admin, { ...typed, vatPayerType }, ctx.db);

  expect(await getVatPayerType(admin, ctx.db)).toBe(vatPayerType);
  expect((await getWorkshopDetails(admin, ctx.db)).vatPayerType).toBe(vatPayerType);
});

test('saving the details leaves the rates of Nastavenia as they were, and saving the rates leaves the details', async () => {
  const rates = { vatRates: '20\n10', defaultVatRate: '10', hourlyRate: '45,5', markup: '30' };
  await saveRates(admin, rates, ctx.db);
  const ratesBefore = await getRates(admin, ctx.db);

  await saveWorkshopDetails(admin, typed, ctx.db);
  expect(await getRates(admin, ctx.db)).toEqual(ratesBefore);

  await saveRates(admin, { ...rates, markup: '5' }, ctx.db);
  expect(await getWorkshopDetails(admin, ctx.db)).toEqual(savedDetails);
});

test('the mechanik cannot save details: forbidden, and what is saved stays', async () => {
  await saveWorkshopDetails(admin, typed, ctx.db);

  await expect(saveWorkshopDetails(mechanic, { ...typed, name: 'Podvrh' }, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);

  expect(await getWorkshopDetails(admin, ctx.db)).toEqual(savedDetails);
});

// The IČ DPH and the platiteľ DPH are identification and status, no amount (the helper skips exactly those two keys); any other key with a price word in the details would show here.
test('the details the mechanik reads have no price key in them', async () => {
  await saveWorkshopDetails(admin, typed, ctx.db);

  expect(findPriceKeys(await getWorkshopDetails(mechanic, ctx.db))).toEqual([]);
});
