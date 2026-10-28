import { describe, expect, test } from 'vitest';
import { can, canSeePrices, capabilities, roles, type Capability } from '../src/access/index.ts';

// A capability the code has never heard of, e.g. one a newer version adds.
const unknown = 'work-orders.delete' as Capability;

describe('Prístup', () => {
  test('there are two roles, admin and mechanik', () => {
    expect([...roles]).toEqual(['admin', 'mechanik']);
  });

  test('the admin may do everything, a capability nobody has listed included', () => {
    for (const capability of capabilities) expect(can('admin', capability), capability).toBe(true);
    expect(can('admin', unknown)).toBe(true);
  });

  test('the mechanik may do only what is on his list: the list of Zákazky and changing his own password', () => {
    const allowed = capabilities.filter((capability) => can('mechanik', capability));

    expect([...allowed].sort()).toEqual(['password.change', 'work-orders.list']);
  });

  test('a capability that is not on the mechanik list is forbidden to him, even one nobody has listed', () => {
    expect(can('mechanik', unknown)).toBe(false);
    expect(can('mechanik', 'work-orders.read')).toBe(false);
    expect(can('mechanik', 'work-orders.write')).toBe(false);
    expect(can('mechanik', 'customers.read')).toBe(false);
    expect(can('mechanik', 'vehicles.read')).toBe(false);
  });

  test('only the admin sees prices', () => {
    expect(canSeePrices('admin')).toBe(true);
    expect(canSeePrices('mechanik')).toBe(false);
  });
});
