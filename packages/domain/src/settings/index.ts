// Settings area (GLOSSARY: Používatelia a nastavenia, Nastavenia). Pure rules: no framework, database or network.
import { parseUnitPrice, parseVatRate } from '../work-order/index.ts';

/** Sadzby DPH, Hodinová sadzba and Prirážka as stored: the VAT rates and the markup in whole percent, the hourly rate in cents without VAT. */
export type Rates = {
  /** The Sadzby DPH the admin picks from, in the order he gave them. At least one, no rate twice. */
  vatRates: number[];
  /** One of `vatRates`. */
  defaultVatRate: number;
  /** `null` when none is set: a Práca is then not given a price. */
  hourlyRateCents: number | null;
  markupPercent: number;
};

/** What the form sends: the VAT rates one per line, every other value as typed. */
export type RatesInput = { vatRates: string; defaultVatRate: string; hourlyRate: string; markup: string };
export type RatesErrors = {
  vatRates?: 'required' | 'invalid' | 'duplicate';
  defaultVatRate?: 'invalid' | 'not-in-list';
  hourlyRate?: 'invalid';
  markup?: 'invalid';
};

/**
 * The specification sets no upper limit for the markup. This one only bounds the integer column that
 * stores it (an int4 holds 2 147 483 647); the price made from a markup is bounded where it is made,
 * by `maxUnitPriceCents` of the Zákazka area.
 */
export const maxMarkupPercent = 10_000;

/** Digits only, or null; a number too big for its field is the caller's `> max`. */
const wholeNumber = (typed: string) => (/^\d+$/.test(typed) ? Number(typed) : null);

/**
 * One rate per line, so that "2,5" is one rate that is wrong, not two that are right. The rates, or
 * why the list is refused; a rate that is wrong is reported before a rate that is there twice.
 */
function parseVatRates(typed: string): number[] | NonNullable<RatesErrors['vatRates']> {
  const lines = typed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return 'required';
  const rates = lines.map(parseVatRate);
  if (rates.includes(null)) return 'invalid';
  return new Set(rates).size < rates.length ? 'duplicate' : (rates as number[]);
}

/**
 * The rates of Nastavenia ready to store, or every reason they are refused. The hourly rate must be a
 * price a Práca may have, because it fills in the price of one; left empty it is none. The markup is
 * never empty: a markup of none is 0 %, typed.
 */
export function parseRates(input: RatesInput): { ok: true; rates: Rates } | { ok: false; errors: RatesErrors } {
  const errors: RatesErrors = {};
  const vatRates = parseVatRates(input.vatRates);
  if (!Array.isArray(vatRates)) errors.vatRates = vatRates;

  const defaultVatRate = parseVatRate(input.defaultVatRate);
  if (defaultVatRate === null) errors.defaultVatRate = 'invalid';
  else if (Array.isArray(vatRates) && !vatRates.includes(defaultVatRate)) errors.defaultVatRate = 'not-in-list';

  const hourlyRate = input.hourlyRate.trim();
  const hourlyRateCents = hourlyRate === '' ? null : parseUnitPrice(hourlyRate);
  if (hourlyRate !== '' && hourlyRateCents === null) errors.hourlyRate = 'invalid';

  const markupPercent = wholeNumber(input.markup.trim());
  if (markupPercent === null || markupPercent > maxMarkupPercent) errors.markup = 'invalid';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, rates: { vatRates: vatRates as number[], defaultVatRate: defaultVatRate!, hourlyRateCents, markupPercent: markupPercent! } };
}

export * from './logo.ts';
