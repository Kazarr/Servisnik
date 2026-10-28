import type { Rates, RatesInput } from '@servisnik/domain/settings';
import { formatEuroInput } from '../../../format.ts';

/** The rates as the fields of their form show them: the inverse of what the domain reads (packages/domain/src/settings). */
export const ratesToFields = (rates: Rates): RatesInput => ({
  vatRates: rates.vatRates.join('\n'),
  defaultVatRate: String(rates.defaultVatRate),
  hourlyRate: rates.hourlyRateCents === null ? '' : formatEuroInput(rates.hourlyRateCents),
  markup: String(rates.markupPercent),
});
