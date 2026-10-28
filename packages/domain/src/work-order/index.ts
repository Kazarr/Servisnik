// Work order area (GLOSSARY: Zákazka a faktúra). Pure rules: no framework, database or network.

import { parseMileageKm } from '../vehicle/index.ts';

/**
 * The Stav zákazky (GLOSSARY) by its code name: `received` Prijatá, `inProgress` V práci, `waitingForParts`
 * Čaká na diely, `done` Hotová, `invoiced` Vyfakturovaná, `cancelled` Zrušená. A new one is added here, in
 * `transitions`, and in `isActive` or `isClosed`.
 */
export const workOrderStatuses = ['received', 'inProgress', 'waitingForParts', 'done', 'invoiced', 'cancelled'] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

/** Rozpracovaná zákazka (GLOSSARY): Prijatá, V práci or Čaká na diely. */
const activeStatuses: readonly WorkOrderStatus[] = ['received', 'inProgress', 'waitingForParts'];
export const isActive = (status: WorkOrderStatus): boolean => activeStatuses.includes(status);

/** Uzavretá zákazka (GLOSSARY): Vyfakturovaná or Zrušená. Hotová is neither Rozpracovaná nor Uzavretá. */
export const isClosed = (status: WorkOrderStatus): boolean => status === 'invoiced' || status === 'cancelled';

/**
 * The one lock of a Zákazka: its items change only while it is Rozpracovaná, because from Hotová on an
 * invoice is made from them. `addLabour` checks it under the row lock; every later write of an item, the
 * discount or the header (kilometres, request, deadline, note) must call `canEdit` the same way, since a
 * hidden button is not enough. Hotová stays locked until ledger question 9 is answered.
 */
export const canEdit = (status: WorkOrderStatus): boolean => isActive(status);

/** `user` is the admin's own button; `invoice` is the invoice being issued, the only way to Vyfakturovaná. */
export type TransitionTrigger = 'user' | 'invoice';

type Transition = { from: WorkOrderStatus; to: WorkOrderStatus; by: TransitionTrigger; confirm?: true };

/**
 * Every allowed change of status, in one table. Anything not listed here is refused. From each
 * Rozpracovaná status the user may go to each other one, to Hotová, and, once he confirmed it, to Zrušená.
 */
const transitions: readonly Transition[] = [
  ...activeStatuses.flatMap((from): Transition[] => [
    ...activeStatuses.filter((to) => to !== from).map((to): Transition => ({ from, to, by: 'user' })),
    { from, to: 'done', by: 'user' },
    { from, to: 'cancelled', by: 'user', confirm: true },
  ]),
  { from: 'done', to: 'invoiced', by: 'invoice' },
];

/**
 * The new status, with the Dátum dokončenia (a day in Europe/Bratislava) when the Zákazka becomes Hotová,
 * every time it does; or why not. A transition that needs the user's confirmation is refused without it.
 */
export function transition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  by: TransitionTrigger,
  now: Date,
  { confirmed = false }: { confirmed?: boolean } = {},
): { ok: true; status: WorkOrderStatus; completedOn?: string } | { ok: false; error: 'not-allowed' | 'confirmation-required' } {
  const allowed = transitions.find((t) => t.from === from && t.to === to && t.by === by);
  if (!allowed) return { ok: false, error: 'not-allowed' };
  if (allowed.confirm && !confirmed) return { ok: false, error: 'confirmation-required' };
  return to === 'done' ? { ok: true, status: to, completedOn: localDate(now) } : { ok: true, status: to };
}

/** The buttons of a Zákazka in this status: where the user may take it, and whether he must confirm first. */
export const userTransitions = (from: WorkOrderStatus): { to: WorkOrderStatus; confirm: boolean }[] =>
  transitions.filter((t) => t.from === from && t.by === 'user').map(({ to, confirm = false }) => ({ to, confirm }));

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

/**
 * What the kilometres of a new Zákazka (Príjem vozidla) do to the Stav km of its Vozidlo: higher ones
 * become its Stav km, as do any when it has none yet. Lower ones leave it as it was and ask for a
 * warning, because the odometer may have been replaced; the Zákazka keeps them either way. Equal ones
 * change nothing and need no warning.
 */
export function mileageAtIntake(vehicleMileageKm: number | null, intakeKm: number): { vehicleMileageKm: number; lowerThanVehicle: boolean } {
  if (vehicleMileageKm === null || intakeKm > vehicleMileageKm) return { vehicleMileageKm: intakeKm, lowerThanVehicle: false };
  return { vehicleMileageKm, lowerThanVehicle: intakeKm < vehicleMileageKm };
}

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

/** Práca or Diel. The model has both from the start; only Práca is added anywhere so far. */
export const itemKinds = ['labour', 'part'] as const;
export type ItemKind = (typeof itemKinds)[number];

/** Položka zákazky; the price is per unit and without VAT (ledger question 8 is open). */
export type WorkOrderItem = Priced & { kind: ItemKind; name: string; unit: string };

// Limits keep every product below 2^53 and every stored number inside a PostgreSQL integer.
const maxQuantityHundredths = 9_999_999; // 99 999,99
const maxUnitPriceCents = 100_000_000; // 1 000 000,00 €

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

const maxVatRate = 100;

/** A Sadzba DPH: a whole percentage from 0 to 100, in digits only (no grouping, so "2 3" is not 23), or null. */
export function parseVatRate(typed: string): number | null {
  const digits = typed.trim();
  const rate = /^\d+$/.test(digits) ? Number(digits) : null;
  return rate === null || rate > maxVatRate ? null : rate;
}

export type WorkOrderInput = { mileageKm: string; customerRequest: string };
export type WorkOrderErrors = { mileageKm?: 'invalid'; customerRequest?: 'required' };

/** A Zákazka ready to store: the kilometres at intake (a whole number, 0 is fine) and the customer's request. */
export function parseWorkOrder(
  input: WorkOrderInput,
): { ok: true; workOrder: { mileageKm: number; customerRequest: string } } | { ok: false; errors: WorkOrderErrors } {
  const mileageKm = parseMileageKm(input.mileageKm);
  const customerRequest = input.customerRequest.trim();
  const errors: WorkOrderErrors = {};
  if (mileageKm === null) errors.mileageKm = 'invalid';
  if (!customerRequest) errors.customerRequest = 'required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, workOrder: { mileageKm: mileageKm!, customerRequest } };
}

/** What the form sends for a Práca; `vatRate` left out means the default rate of Nastavenia, a blank one is a mistake. */
export type LabourInput = { name: string; quantity: string; unitPrice: string; vatRate?: string };
export type LabourErrors = { name?: 'required'; quantity?: 'invalid'; unitPrice?: 'invalid'; vatRate?: 'invalid' };

/**
 * A Práca ready to store: hours (more than 0), a unit price without VAT (0 or more) and a whole VAT
 * percentage from 0 to 100. `defaultVatRate` is the one to take when none was typed.
 */
export function parseLabour(input: LabourInput, defaultVatRate: number): { ok: true; item: WorkOrderItem } | { ok: false; errors: LabourErrors } {
  const name = input.name.trim();
  const quantityHundredths = hundredths(input.quantity);
  const unitPriceCents = parseUnitPrice(input.unitPrice);
  const vatRate = input.vatRate === undefined ? defaultVatRate : parseVatRate(input.vatRate);
  const errors: LabourErrors = {};
  if (!name) errors.name = 'required';
  if (quantityHundredths === null || quantityHundredths < 1 || quantityHundredths > maxQuantityHundredths) errors.quantity = 'invalid';
  if (unitPriceCents === null) errors.unitPrice = 'invalid';
  if (vatRate === null) errors.vatRate = 'invalid';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, item: { kind: 'labour', name, quantityHundredths: quantityHundredths!, unit: 'h', unitPriceCents: unitPriceCents!, vatRate: vatRate! } };
}
