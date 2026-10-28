// Workshop area (GLOSSARY: Autoservis, Údaje autoservisu, Platiteľ DPH). Pure rules: no framework, database or network.
import { formatErrors, normalizePostalCode } from '../customer/index.ts';

/**
 * The Platiteľ DPH: a platiteľ, a neplatiteľ or a registrovaný podľa §7. Servisník keeps these names;
 * turning them into the number KROS wants (`vatPayerType` 0, 1, 2) is the invoicing's (#55).
 */
export const vatPayerTypes = ['payer', 'nonPayer', 'section7'] as const;
export type VatPayerType = (typeof vatPayerTypes)[number];

/** Údaje autoservisu as stored: what is not filled in is null, only the name is always there (empty until the admin first saves). */
export type WorkshopDetails = {
  name: string;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  ico: string | null;
  dic: string | null;
  icDph: string | null;
  vatPayerType: VatPayerType;
  /** Without spaces and in capitals. */
  iban: string | null;
  phone: string | null;
  email: string | null;
  /** Zápis v obchodnom registri: free text. */
  commercialRegister: string | null;
};

/** What the form sends: every value as typed, the platiteľ DPH as one of `vatPayerTypes`. */
export type WorkshopDetailsInput = Record<keyof WorkshopDetails, string>;

export type WorkshopDetailsErrors = {
  name?: 'required';
  ico?: 'format';
  dic?: 'format';
  /** `required` is a platiteľ DPH without one. */
  icDph?: 'format' | 'required';
  postalCode?: 'format';
  email?: 'format';
  iban?: 'invalid';
  vatPayerType?: 'invalid';
};

const blankToNull = (value: string) => value.trim() || null;

// ponytail: shape and checksum only; the length each country gives its IBAN is not checked, mod 97 catches a wrong one but for 1 in 97.
const ibanShape = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** The IBAN is valid when it is the shape of one and its mod 97 checksum is 1 (ISO 13616): the first four characters go last, A is 10 … Z is 35. */
function isValidIban(iban: string) {
  if (!ibanShape.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  return BigInt(digits) % 97n === 1n;
}

const isVatPayerType = (value: string): value is VatPayerType => (vatPayerTypes as readonly string[]).includes(value);

/**
 * Údaje autoservisu ready to store, or every reason they are refused. Only the name is required, every
 * other value is checked when it is filled in: the formats of IČO, DIČ, IČ DPH, PSČ and e-mail are the
 * Zákazník area's, the IBAN is checked by its checksum, and a platiteľ DPH needs an IČ DPH.
 */
export function parseWorkshopDetails(input: WorkshopDetailsInput): { ok: true; details: WorkshopDetails } | { ok: false; errors: WorkshopDetailsErrors } {
  const postalCode = blankToNull(input.postalCode);
  const iban = blankToNull(input.iban.replace(/\s/g, '').toUpperCase());
  const vatPayerType = input.vatPayerType;
  const details = {
    name: input.name.trim(),
    street: blankToNull(input.street),
    city: blankToNull(input.city),
    postalCode: postalCode && normalizePostalCode(postalCode),
    ico: blankToNull(input.ico),
    dic: blankToNull(input.dic),
    icDph: blankToNull(input.icDph),
    iban,
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    commercialRegister: blankToNull(input.commercialRegister),
  };

  const errors: WorkshopDetailsErrors = formatErrors(details);
  if (!details.name) errors.name = 'required';
  if (iban && !isValidIban(iban)) errors.iban = 'invalid';
  if (!isVatPayerType(vatPayerType)) errors.vatPayerType = 'invalid';
  else if (vatPayerType === 'payer' && !details.icDph) errors.icDph = 'required';

  if (!isVatPayerType(vatPayerType) || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, details: { ...details, vatPayerType } };
}
