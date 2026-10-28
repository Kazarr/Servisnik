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
  'work-orders.job-sheet',
  'work-orders.quote',
  'work-orders.handover',
  'price-list.read',
  'price-list.write',
  'password.change',
  'settings.read',
  'settings.write',
  'workshop.read',
  'users.read',
  'users.write',
] as const;
export type Capability = (typeof capabilities)[number];

/**
 * What a mechanik may do. Everything else is forbidden to him, so a forgotten check reveals nothing.
 * `workshop.read` is the details and the logo of the Autoservis, which the forms he prints carry; the
 * rates and every other value of Nastavenia stay behind `settings.read`. Writing them is `settings.write`.
 * `work-orders.job-sheet` is printing the zákazkový list, the one form he prints (spec #95, Mechanik); the cenová ponuka
 * (`work-orders.quote`) and the odovzdávací protokol (`work-orders.handover`) are the admin's alone.
 */
const mechanikCapabilities: readonly Capability[] = ['work-orders.list', 'work-orders.job-sheet', 'password.change', 'workshop.read'];

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
  const profile = parseUserEdit(input);
  const errors: NewUserErrors = profile.ok ? {} : profile.errors;
  const password = passwordError(input.password);
  if (password) errors.password = password;
  if (!profile.ok || !profile.edit.role || password) return { ok: false, errors };
  return { ok: true, user: { ...profile.edit, role: profile.edit.role, password: input.password } };
}

/** What the form that edits a Používateľ sends, every value as typed. No `role` means that the Rola stays as it is. */
export type UserEditInput = { name: string; email: string; role?: string };
export type UserEdit = { name: string; email: string; role?: Role };
export type UserEditErrors = { name?: 'required'; email?: 'format'; role?: 'invalid' };

/**
 * An edit of a Používateľ ready to be saved, or every reason it is not one. The name and the e-mail
 * are cleaned like a new user's. A role that was sent must be one of ours, an empty one too; none
 * means the edit leaves the Rola as it is.
 */
export function parseUserEdit(input: UserEditInput): { ok: true; edit: UserEdit } | { ok: false; errors: UserEditErrors } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = roles.find((known) => known === input.role);
  const errors: UserEditErrors = {};
  if (!name) errors.name = 'required';
  if (!isEmail(email)) errors.email = 'format';
  if (input.role !== undefined && !role) errors.role = 'invalid';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, edit: { name, email, ...(role && { role }) } };
}
