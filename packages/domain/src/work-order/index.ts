// Work order area (GLOSSARY: Zákazka a faktúra). Pure rules: no framework, database or network.

/** Prijatá, Hotová, Vyfakturovaná. Further statuses (V práci, Čaká na diely, Zrušená) are added here and in `transitions`. */
export const workOrderStatuses = ['received', 'done', 'invoiced'] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

/** `user` is the admin's own button; `invoice` is the invoice being issued, the only way to Vyfakturovaná. */
export type TransitionTrigger = 'user' | 'invoice';

/** Every allowed change of status, in one table. Anything not listed here is refused. */
const transitions: readonly { from: WorkOrderStatus; to: WorkOrderStatus; by: TransitionTrigger }[] = [
  { from: 'received', to: 'done', by: 'user' },
  { from: 'done', to: 'invoiced', by: 'invoice' },
];

/** The new status, with the delivery date (a day in Europe/Bratislava) when the Zákazka becomes Hotová; or why not. */
export function transition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  by: TransitionTrigger,
  now: Date,
): { ok: true; status: WorkOrderStatus; completedOn?: string } | { ok: false; error: 'not-allowed' } {
  if (!transitions.some((t) => t.from === from && t.to === to && t.by === by)) return { ok: false, error: 'not-allowed' };
  return to === 'done' ? { ok: true, status: to, completedOn: localDate(now) } : { ok: true, status: to };
}

/** A Zákazka is open until it is invoiced. */
export const isOpen = (status: WorkOrderStatus): boolean => status !== 'invoiced';

/** Items change the amounts an invoice is made from, so they are added only while the Zákazka is Prijatá. */
export const canAddItems = (status: WorkOrderStatus): boolean => status === 'received';

/** `Z<year>-<sequence on four places>`; the sequence restarts at 1 every year, the database hands it out. */
export function formatWorkOrderNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new RangeError(`Not a sequence: ${sequence}`);
  return `Z${year}-${String(sequence).padStart(4, '0')}`;
}

const bratislava = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar date `YYYY-MM-DD` at this moment in Europe/Bratislava, where the autoservis works. */
export function localDate(instant: Date): string {
  const parts = Object.fromEntries(bratislava.formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The year at this moment in Europe/Bratislava, which is the year of a new Zákazka's number. */
export const localYear = (instant: Date): number => Number(localDate(instant).slice(0, 4));

/** Money is whole cents and a quantity is in hundredths, so no amount here is ever a float. */
export type Amounts = { net: number; vat: number; gross: number };
export type Priced = { quantityHundredths: number; unitPriceCents: number; vatRate: number };

/** `numerator / denominator` rounded half up; both are non-negative. */
const roundedDivide = (numerator: number, denominator: number) => Math.floor((2 * numerator + denominator) / (2 * denominator));

/**
 * What one item costs, rounded to cents once per item: first the amount without VAT, then the VAT
 * taken from that rounded amount. `vatRate` is a whole percentage.
 */
export function amountsOf({ quantityHundredths, unitPriceCents, vatRate }: Priced): Amounts {
  const net = roundedDivide(quantityHundredths * unitPriceCents, 100);
  const vat = roundedDivide(net * vatRate, 100);
  return { net, vat, gross: net + vat };
}

/** What a Zákazka costs: the sum of its rounded items, never a rounding of the sums. */
export function totalsOf(items: readonly Priced[]): Amounts {
  const sum = (key: keyof Amounts) => items.reduce((total, item) => total + amountsOf(item)[key], 0);
  return { net: sum('net'), vat: sum('vat'), gross: sum('gross') };
}
