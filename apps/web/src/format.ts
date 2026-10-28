// Display only: how amounts, quantities and dates read on a page in Slovak. The rules about them live in packages/domain.

const twoDecimals = new Intl.NumberFormat('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const upToTwoDecimals = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('sk-SK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('sk-SK');

/** Whole cents as euros, e.g. 7380 is "73,80 €". */
export const formatEuro = (cents: number) => `${twoDecimals.format(cents / 100)} €`;

/** Whole cents as typed in a field, without the sign or the grouping: 7380 is "73,80". The domain reads it back as the same cents. No price is an empty field. */
export const formatEuroInput = (cents: number | null) => (cents === null ? '' : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`);

/** A quantity in hundredths, e.g. 150 is "1,5". */
export const formatQuantity = (hundredths: number) => upToTwoDecimals.format(hundredths / 100);

/** A quantity in hundredths as typed in a field, without the grouping: 150 is "1,5", 400 is "4". The domain reads it back as the same hundredths. */
export const formatQuantityInput = (hundredths: number) => {
  const fraction = String(hundredths % 100).padStart(2, '0').replace(/0+$/, '');
  return `${Math.floor(hundredths / 100)}${fraction && `,${fraction}`}`;
};

/** A Prirážka in tenths of a percent as typed in a field: 250 is "25", 125 is "12,5", -3 is "-0,3". No Prirážka is an empty field. */
export const formatMarkupInput = (tenths: number | null) => {
  if (tenths === null) return '';
  const decimal = Math.abs(tenths) % 10;
  return `${tenths < 0 ? '-' : ''}${Math.floor(Math.abs(tenths) / 10)}${decimal ? `,${decimal}` : ''}`;
};

/** A percentage in tenths of a percent, always with its one decimal: 765 is "76,5 %". */
export const formatPercent = (tenths: number) => `${oneDecimal.format(tenths / 10)} %`;

/** How many Diely, in the form Slovak counts them: "1 diel", "2 diely" up to 4, "5 dielov". */
export const formatPartCount = (count: number) => `${count} ${count === 1 ? 'diel' : count >= 2 && count <= 4 ? 'diely' : 'dielov'}`;

/** A whole number, grouped by thousands: 123456 is "123 456". */
export const formatWhole = (value: number) => whole.format(value);

/** A calendar day `YYYY-MM-DD`, e.g. "26. 10. 2026". */
export const formatDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('sk-SK', { timeZone: 'UTC' });
