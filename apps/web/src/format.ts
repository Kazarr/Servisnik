// Display only: how amounts, quantities and dates read on a page in Slovak. The rules about them live in packages/domain.

const twoDecimals = new Intl.NumberFormat('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const upToTwoDecimals = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('sk-SK');

/** Whole cents as euros, e.g. 7380 is "73,80 €". */
export const formatEuro = (cents: number) => `${twoDecimals.format(cents / 100)} €`;

/** A quantity in hundredths, e.g. 150 is "1,5". */
export const formatQuantity = (hundredths: number) => upToTwoDecimals.format(hundredths / 100);

/** A whole number, grouped by thousands: 123456 is "123 456". */
export const formatWhole = (value: number) => whole.format(value);

/** A calendar day `YYYY-MM-DD`, e.g. "26. 10. 2026". */
export const formatDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('sk-SK', { timeZone: 'UTC' });
