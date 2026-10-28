// Work order area (GLOSSARY: Zákazka a faktúra). Pure rules: no framework, database or network.

/** The Stav zákazky (GLOSSARY) by its code name: `received` Prijatá, `done` Hotová, `invoiced` Vyfakturovaná. A new one is added here and in `transitions`. */
export const workOrderStatuses = ['received', 'done', 'invoiced'] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

/** `user` is the admin's own button; `invoice` is the invoice being issued, the only way to Vyfakturovaná. */
export type TransitionTrigger = 'user' | 'invoice';

/** Every allowed change of status, in one table. Anything not listed here is refused. */
const transitions: readonly { from: WorkOrderStatus; to: WorkOrderStatus; by: TransitionTrigger }[] = [
  { from: 'received', to: 'done', by: 'user' },
  { from: 'done', to: 'invoiced', by: 'invoice' },
];

/** The new status, with the Dátum dokončenia (a day in Europe/Bratislava) when the Zákazka becomes Hotová; or why not. */
export function transition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  by: TransitionTrigger,
  now: Date,
): { ok: true; status: WorkOrderStatus; completedOn?: string } | { ok: false; error: 'not-allowed' } {
  if (!transitions.some((t) => t.from === from && t.to === to && t.by === by)) return { ok: false, error: 'not-allowed' };
  return to === 'done' ? { ok: true, status: to, completedOn: localDate(now) } : { ok: true, status: to };
}

/** Uzavretá zákazka (GLOSSARY): of the statuses here only Vyfakturovaná closes a Zákazka. */
export const isClosed = (status: WorkOrderStatus): boolean => status === 'invoiced';

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
  return items.map(amountsOf).reduce(
    (total, item) => ({ net: total.net + item.net, vat: total.vat + item.vat, gross: total.gross + item.gross }),
    { net: 0, vat: 0, gross: 0 },
  );
}

/** Práca or Diel. */
export const itemKinds = ['labour', 'part'] as const;
export type ItemKind = (typeof itemKinds)[number];

/** The unit a Položka starts with: hours for a Práca, pieces for a Diel. */
export const defaultUnits: Record<ItemKind, string> = { labour: 'h', part: 'ks' };

/**
 * Položka zákazky. Its prices are per unit and without VAT (ledger question 8 is open): `unitPriceCents`
 * is the Predajná cena, `purchasePriceCents` the Nákupná cena of a Diel, which is none when it is not known
 * and always none for a Práca.
 */
export type WorkOrderItem = Priced & { kind: ItemKind; code: string | null; name: string; unit: string; purchasePriceCents: number | null };

// Limits keep every product below 2^53 and every stored number inside a PostgreSQL integer.
const maxQuantityHundredths = 9_999_999; // 99 999,99
const maxUnitPriceCents = 100_000_000; // 1 000 000,00 €
const maxMileageKm = 9_999_999;

/**
 * A number typed with a decimal comma or point and at most two decimals, as hundredths, or null.
 * Read from the digits: 1,15 * 100 is 114.99999999999999 as a float.
 */
function hundredths(typed: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(typed.replace(/\s/g, ''));
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null;
}

/** A price per unit typed in euros: cents from 0 up to the largest price an item may have, or null. */
export function parseUnitPrice(typed: string): number | null {
  const cents = hundredths(typed);
  return cents === null || cents > maxUnitPriceCents ? null : cents;
}

/** A whole number such as the kilometres; spaces may group the digits. */
function wholeNumber(typed: string): number | null {
  const digits = typed.replace(/\s/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

const maxVatRate = 100;

/** A Sadzba DPH: a whole percentage from 0 to 100, in digits only (no grouping, so "2 3" is not 23), or null. */
export function parseVatRate(typed: string): number | null {
  const digits = typed.trim();
  const rate = /^\d+$/.test(digits) ? Number(digits) : null;
  return rate === null || rate > maxVatRate ? null : rate;
}

// Prirážka (GLOSSARY) is never stored: a form turns it into a Predajná cena and back. It is counted in
// tenths of a percent (125 is 12,5 %), the precision it is shown with, so no amount here is a float.

/** A Prirážka typed in a field: from 0 percent, at most one decimal after a comma or a point; as tenths of a percent, or null. */
export function parseMarkup(typed: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d))?$/.exec(typed.replace(/\s/g, ''));
  return match ? Number(match[1]) * 10 + Number(match[2] ?? 0) : null;
}

/** The Predajná cena in cents that a Prirážka makes of a Nákupná cena, rounded half up to the cent; null above the largest price a Položka may have. */
export function salePriceFromMarkup(purchasePriceCents: number, markupTenths: number): number | null {
  const salePriceCents = roundedDivide(purchasePriceCents * (1000 + markupTenths), 1000);
  return salePriceCents > maxUnitPriceCents ? null : salePriceCents;
}

/**
 * The Prirážka, in tenths of a percent, that makes a Predajná cena of a Nákupná cena: rounded half away
 * from zero, negative when sold below the purchase price. Null on a purchase price of 0, which has no percentage.
 */
export function markupFromSalePrice(purchasePriceCents: number, salePriceCents: number): number | null {
  if (purchasePriceCents === 0) return null;
  const difference = salePriceCents - purchasePriceCents;
  const tenths = roundedDivide(Math.abs(difference) * 1000, purchasePriceCents);
  return difference < 0 ? 0 - tenths : tenths; // not -tenths, which is -0 when the difference rounds to nothing
}

export type WorkOrderInput = { mileageKm: string; customerRequest: string };
export type WorkOrderErrors = { mileageKm?: 'invalid'; customerRequest?: 'required' };

/** A Zákazka ready to store: the kilometres at intake (a whole number, 0 is fine) and the customer's request. */
export function parseWorkOrder(
  input: WorkOrderInput,
): { ok: true; workOrder: { mileageKm: number; customerRequest: string } } | { ok: false; errors: WorkOrderErrors } {
  const mileageKm = wholeNumber(input.mileageKm);
  const customerRequest = input.customerRequest.trim();
  const errors: WorkOrderErrors = {};
  if (mileageKm === null || mileageKm > maxMileageKm) errors.mileageKm = 'invalid';
  if (!customerRequest) errors.customerRequest = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, workOrder: { mileageKm: mileageKm!, customerRequest } };
}

/**
 * What the form sends for a Položka. Left out, `unit` is the default of its kind and `vatRate` the default
 * rate of Nastavenia; sent blank, either is a mistake. `purchasePrice` is only read for a Diel, blank is none.
 */
export type ItemInput = {
  kind: ItemKind;
  code?: string;
  name: string;
  quantity: string;
  unit?: string;
  purchasePrice?: string;
  unitPrice: string;
  vatRate?: string;
};
export type ItemErrors = {
  name?: 'required';
  quantity?: 'invalid';
  unit?: 'required';
  purchasePrice?: 'invalid';
  unitPrice?: 'invalid';
  vatRate?: 'invalid';
};

/**
 * A Položka ready to store: a quantity of more than 0, prices without VAT (0 or more) and one of the
 * `vatRates` of Nastavenia, `defaultVatRate` when none was typed.
 */
export function parseItem(
  input: ItemInput,
  rates: { defaultVatRate: number; vatRates: readonly number[] },
): { ok: true; item: WorkOrderItem } | { ok: false; errors: ItemErrors } {
  const name = input.name.trim();
  const quantityHundredths = hundredths(input.quantity);
  const unit = input.unit === undefined ? defaultUnits[input.kind] : input.unit.trim();
  const typedPurchasePrice = input.kind === 'part' ? (input.purchasePrice ?? '').trim() : '';
  const purchasePriceCents = typedPurchasePrice === '' ? null : parseUnitPrice(typedPurchasePrice);
  const unitPriceCents = parseUnitPrice(input.unitPrice);
  const vatRate = input.vatRate === undefined ? rates.defaultVatRate : parseVatRate(input.vatRate);
  const errors: ItemErrors = {};
  if (!name) errors.name = 'required';
  if (quantityHundredths === null || quantityHundredths < 1 || quantityHundredths > maxQuantityHundredths) errors.quantity = 'invalid';
  if (!unit) errors.unit = 'required';
  if (typedPurchasePrice !== '' && purchasePriceCents === null) errors.purchasePrice = 'invalid';
  if (unitPriceCents === null) errors.unitPrice = 'invalid';
  if (vatRate === null || !rates.vatRates.includes(vatRate)) errors.vatRate = 'invalid';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    item: {
      kind: input.kind,
      code: input.code?.trim() || null,
      name,
      quantityHundredths: quantityHundredths!,
      unit,
      purchasePriceCents,
      unitPriceCents: unitPriceCents!,
      vatRate: vatRate!,
    },
  };
}

