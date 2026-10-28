// Access area (GLOSSARY: Používatelia a nastavenia, Rola, Schopnosť). Pure rules: no framework, database or network.

/** The two Roly of a Používateľ. */
export const roles = ['admin', 'mechanik'] as const;
export type Role = (typeof roles)[number];

/** Every Schopnosť the code knows. A new action starts here, and no Rola but the admin may do it until it is allowed below. */
export const capabilities = [
  'customers.read',
  'customers.write',
  'vehicles.read',
  'vehicles.write',
  'work-orders.list',
  'work-orders.read',
  'work-orders.write',
  'password.change',
  'settings.read',
  'settings.write',
] as const;
export type Capability = (typeof capabilities)[number];

/** What a mechanik may do. Everything else is forbidden to him, so a forgotten check reveals nothing. */
const mechanikCapabilities: readonly Capability[] = ['work-orders.list', 'password.change'];

/** The admin may do everything; the mechanik only what is on his list. */
export const can = (role: Role, capability: Capability) => role === 'admin' || mechanikCapabilities.includes(capability);

/** Only the admin sees prices, sums, VAT and margins. */
export const canSeePrices = (role: Role) => role === 'admin';

/**
 * A password is 8 to 128 characters, with no rule on which. These are the numbers apps/web/src/auth.ts
 * hands Better Auth, so there is one rule; both count in UTF-16 units, like `length`.
 */
export const passwordLength = { min: 8, max: 128 } as const;
export type PasswordError = 'tooShort' | 'tooLong';

/** Why a password may not be set, or null when its length is fine. */
export const passwordError = (password: string): PasswordError | null =>
  password.length < passwordLength.min ? 'tooShort' : password.length > passwordLength.max ? 'tooLong' : null;
