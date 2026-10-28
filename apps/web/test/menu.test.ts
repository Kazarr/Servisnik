import { capabilities } from '@servisnik/domain/access';
import { expect, test } from 'vitest';
import { menu, menuFor } from '../src/app/(app)/menu.ts';

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
