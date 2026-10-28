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

  test('the mechanik may do only what is on his list: the list of Zákazky, changing his own password and reading Údaje autoservisu', () => {
    const allowed = capabilities.filter((capability) => can('mechanik', capability));

    expect([...allowed].sort()).toEqual(['password.change', 'work-orders.list', 'workshop.read']);
  });

  test('a capability that is not on the mechanik list is forbidden to him, even one nobody has listed', () => {
    expect(can('mechanik', unknown)).toBe(false);
    expect(can('mechanik', 'work-orders.read')).toBe(false);
    expect(can('mechanik', 'work-orders.write')).toBe(false);
    expect(can('mechanik', 'customers.read')).toBe(false);
    expect(can('mechanik', 'vehicles.read')).toBe(false);
  });

  // The rates in Nastavenia are prices (the hourly rate, the markup) and VAT: a mechanik gets none of them, and cannot change them.
  test('the mechanik may neither read nor write Nastavenia, the admin does both', () => {
    for (const capability of ['settings.read', 'settings.write'] as const) {
      expect(capabilities, capability).toContain(capability);
      expect(can('admin', capability), capability).toBe(true);
      expect(can('mechanik', capability), capability).toBe(false);
    }
  });

  // The Údaje autoservisu are printed on the documents a mechanik prints (the job sheet), so he reads them; only the admin writes them, with settings.write.
  test('the mechanik reads Údaje autoservisu, which the Nastavenia capabilities do not give him, and writes none', () => {
    expect(capabilities).toContain('workshop.read');
    expect(can('admin', 'workshop.read')).toBe(true);
    expect(can('mechanik', 'workshop.read')).toBe(true);
    expect(can('mechanik', 'settings.read')).toBe(false);
    expect(can('mechanik', 'settings.write')).toBe(false);
  });

  test('only the admin sees prices', () => {
    expect(canSeePrices('admin')).toBe(true);
    expect(canSeePrices('mechanik')).toBe(false);
  });
});
