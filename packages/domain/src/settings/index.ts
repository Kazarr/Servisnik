// Settings area (GLOSSARY: Používatelia a nastavenia, Nastavenia). Pure rules: no framework, database or network.
import { parseUnitPrice } from '../work-order/index.ts';

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

/** There is no markup limit in the specification; this keeps a price computed from it inside a PostgreSQL integer and a safe number. */
export const maxMarkupPercent = 10_000;
const maxVatRate = 100;

/** Digits only, or null; a number too big for its field is the caller's `> max`. */
const wholeNumber = (typed: string) => (/^\d+$/.test(typed) ? Number(typed) : null);

/**
 * One rate per line, so that "2,5" is one rate that is wrong, not two that are right. The rates, or
 * why the list is refused; a rate that is wrong is reported before a rate that is there twice.
 */
function parseVatRates(typed: string): number[] | NonNullable<RatesErrors['vatRates']> {
  const lines = typed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return 'required';
  const rates = lines.map(wholeNumber);
  if (rates.some((rate) => rate === null || rate > maxVatRate)) return 'invalid';
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

  const defaultVatRate = wholeNumber(input.defaultVatRate.trim());
  if (defaultVatRate === null || defaultVatRate > maxVatRate) errors.defaultVatRate = 'invalid';
  else if (Array.isArray(vatRates) && !vatRates.includes(defaultVatRate)) errors.defaultVatRate = 'not-in-list';

  const hourlyRate = input.hourlyRate.trim();
  const hourlyRateCents = hourlyRate === '' ? null : parseUnitPrice(hourlyRate);
  if (hourlyRate !== '' && hourlyRateCents === null) errors.hourlyRate = 'invalid';

  const markupPercent = wholeNumber(input.markup.trim());
  if (markupPercent === null || markupPercent > maxMarkupPercent) errors.markup = 'invalid';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, rates: { vatRates: vatRates as number[], defaultVatRate: defaultVatRate!, hourlyRateCents, markupPercent: markupPercent! } };
}
