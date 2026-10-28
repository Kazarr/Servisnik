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
