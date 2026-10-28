import { can, type Capability, type Role } from '@servisnik/domain/access';

/** The one list the menu is made of. An item without a capability does not compile, so none is shown to a role by accident. */
export const menu: readonly { href: string; label: string; capability: Capability }[] = [
  { href: '/zakaznici', label: 'Zákazníci', capability: 'customers.read' },
  { href: '/vozidla', label: 'Vozidlá', capability: 'vehicles.read' },
  { href: '/zakazky', label: 'Zákazky', capability: 'work-orders.list' },
  { href: '/nastavenia', label: 'Nastavenia', capability: 'settings.read' },
];

/** Where the e-mail under the menu leads: the change of the own password, for a Rola that may do it. */
export const ownPassword = { href: '/heslo', capability: 'password.change' } as const satisfies { href: string; capability: Capability };

/** The items of the menu this Rola may open. */
export const menuFor = (role: Role) => menu.filter(({ capability }) => can(role, capability));
