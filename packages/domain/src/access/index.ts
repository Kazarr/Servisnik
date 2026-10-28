// Access area (GLOSSARY: Používatelia a nastavenia, Rola, Schopnosť). Pure rules: no framework, database or network.
import { isEmail } from '../customer/index.ts';

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
  'users.read',
  'users.write',
  'workshop.read',
] as const;
export type Capability = (typeof capabilities)[number];

/**
 * What a mechanik may do. Everything else is forbidden to him, so a forgotten check reveals nothing.
 * `workshop.read` is Údaje autoservisu: the documents he prints carry them. Writing them is `settings.write`.
 */
const mechanikCapabilities: readonly Capability[] = ['work-orders.list', 'password.change', 'workshop.read'];

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

/** What the form for a new Používateľ sends, every value as typed. */
export type NewUserInput = { name: string; email: string; role: string; password: string };
export type NewUser = { name: string; email: string; role: Role; password: string };
export type NewUserErrors = { name?: 'required'; email?: 'format'; role?: 'invalid'; password?: PasswordError };

/**
 * A Používateľ ready to be created, or every reason it is not one. The e-mail is stored in lower
 * case, so that two e-mails which differ only in case are one. The password is kept as typed, spaces
 * included; Better Auth does not check its minimal length when an admin creates a user, so this does.
 */
export function parseNewUser(input: NewUserInput): { ok: true; user: NewUser } | { ok: false; errors: NewUserErrors } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = roles.find((known) => known === input.role);
  const errors: NewUserErrors = {};
  if (!name) errors.name = 'required';
  if (!isEmail(email)) errors.email = 'format';
  if (!role) errors.role = 'invalid';
  const password = passwordError(input.password);
  if (password) errors.password = password;
  if (Object.keys(errors).length > 0 || !role) return { ok: false, errors };
  return { ok: true, user: { name, email, role, password: input.password } };
}
