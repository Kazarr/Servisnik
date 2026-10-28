import type { User } from '../../src/dal/user.ts';

// What the tests of the Data Access Layer share: the two Roly and the id of a saved record.

export const admin: User = { id: 'user-1', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };
export const mechanic: User = { id: 'user-2', email: 'mechanik@autoservis.test', name: 'Mechanik', role: 'mechanik' };

/** The id of the record a create function saved; the test fails when it was refused. */
export function idOf(result: { ok: true; id: string } | { ok: false }) {
  if (!result.ok) throw new Error(`The record was expected to be saved: ${JSON.stringify(result)}`);
  return result.id;
}
