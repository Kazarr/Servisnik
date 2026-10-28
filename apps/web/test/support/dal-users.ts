import type { User } from '../../src/dal/user.ts';

// The two Používatelia the tests of the Data Access Layer call it with; the Rola decides what each may do.

export const admin: User = { id: 'user-1', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };
export const mechanic: User = { id: 'user-2', email: 'mechanik@autoservis.test', name: 'Mechanik', role: 'mechanik' };
