import { can, capabilities, roles } from '@servisnik/domain/access';
import { expect, test } from 'vitest';
import { menu, menuFor, ownPassword } from '../src/app/(app)/menu.ts';

const shown = (role: 'admin' | 'mechanik') => menuFor(role).map(({ href, label }) => ({ href, label }));

test('the admin sees the whole menu', () => {
  expect(shown('admin')).toEqual([
    { href: '/zakaznici', label: 'Zákazníci' },
    { href: '/vozidla', label: 'Vozidlá' },
    { href: '/zakazky', label: 'Zákazky' },
    { href: '/nastavenia', label: 'Nastavenia' },
  ]);
});

test('the mechanik sees only Zákazky', () => {
  expect(shown('mechanik')).toEqual([{ href: '/zakazky', label: 'Zákazky' }]);
});

test('every item of the menu names a capability the domain knows', () => {
  for (const { href, capability } of menu) expect(capabilities, href).toContain(capability);
});

test('the e-mail under the menu links to the change of the own password, which both roles may open', () => {
  expect(ownPassword).toEqual({ href: '/heslo', capability: 'password.change' });
  expect(capabilities).toContain(ownPassword.capability);
  for (const role of roles) expect(can(role, ownPassword.capability), role).toBe(true);
});
