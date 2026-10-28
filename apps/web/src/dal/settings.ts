import { parseRates, type Rates, type RatesErrors, type RatesInput } from '@servisnik/domain/settings';
import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { workshop } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';

// The values of Nastavenia live in the one row of `workshop` (src/db/schema.ts), which the migration creates.
const theWorkshop = eq(workshop.id, 1);
const ratesColumns = {
  vatRates: workshop.vatRates,
  defaultVatRate: workshop.defaultVatRate,
  hourlyRateCents: workshop.hourlyRateCents,
  markupPercent: workshop.markupPercent,
};

/**
 * The VAT rates, the default one, the hourly rate and the markup, in one read. Only the admin may read
 * them: they are VAT and prices, which a mechanik never gets.
 */
export async function getRates(user: User | null, db: Database = getDb()): Promise<Rates> {
  assertCan(user, 'settings.read');
  const [rates] = await db.select(ratesColumns).from(workshop).where(theWorkshop);
  return rates!;
}

export type SaveRatesResult = { ok: true; rates: Rates } | { ok: false; errors: RatesErrors };

/** Replaces the rates with what the domain accepts (packages/domain/src/settings). Work already on a Zákazka keeps the rate it has. */
export async function saveRates(user: User | null, input: RatesInput, db: Database = getDb()): Promise<SaveRatesResult> {
  assertCan(user, 'settings.write');
  const parsed = parseRates(input);
  if (!parsed.ok) return parsed;
  const [rates] = await db.update(workshop).set(parsed.rates).where(theWorkshop).returning(ratesColumns);
  return { ok: true, rates: rates! };
}
