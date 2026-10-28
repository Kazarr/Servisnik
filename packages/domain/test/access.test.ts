import { describe, expect, test } from 'vitest';
import {
  can,
  canSeePrices,
  capabilities,
  parseNewUser,
  parseUserEdit,
  passwordError,
  passwordLength,
  roles,
  type Capability,
  type NewUserInput,
  type UserEditInput,
} from '../src/access/index.ts';

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

  test('the mechanik may do only what is on his list: the list of Zákazky, printing the zákazkový list, changing his own password and reading the details and logo of the autoservis for print', () => {
    const allowed = capabilities.filter((capability) => can('mechanik', capability));

    expect([...allowed].sort()).toEqual(['password.change', 'work-orders.job-sheet', 'work-orders.list', 'workshop.read']);
  });

  // The zákazkový list has no price (spec #95, Mechanik): he prints it for the car, but still reads and changes no Zákazka.
  test('the mechanik prints the zákazkový list without being able to read or change a Zákazka', () => {
    expect(capabilities).toContain('work-orders.job-sheet');
    expect(can('admin', 'work-orders.job-sheet')).toBe(true);
    expect(can('mechanik', 'work-orders.job-sheet')).toBe(true);
    expect(can('mechanik', 'work-orders.read')).toBe(false);
    expect(can('mechanik', 'work-orders.write')).toBe(false);
  });

  // The Cenová ponuka has the prices and the Odovzdávací protokol the signatures of the autoservis: both are the admin's (spec #95, Mechanik).
  test('the admin prints the cenová ponuka and the odovzdávací protokol, the mechanik prints neither', () => {
    for (const capability of ['work-orders.quote', 'work-orders.handover'] as const) {
      expect(capabilities, capability).toContain(capability);
      expect(can('admin', capability), capability).toBe(true);
      expect(can('mechanik', capability), capability).toBe(false);
    }
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

  // The list of Používatelia and the creation of one are the admin's alone: they hand out access to everything.
  test('the mechanik may neither list nor create Používatelia, the admin does both', () => {
    for (const capability of ['users.read', 'users.write'] as const) {
      expect(capabilities, capability).toContain(capability);
      expect(can('admin', capability), capability).toBe(true);
      expect(can('mechanik', capability), capability).toBe(false);
    }
  });

  // The Cenník is purchase prices, sale prices and VAT, the things a mechanik never gets.
  test('the mechanik may neither read nor write the Cenník, the admin does both', () => {
    for (const capability of ['price-list.read', 'price-list.write'] as const) {
      expect(capabilities, capability).toContain(capability);
      expect(can('admin', capability), capability).toBe(true);
      expect(can('mechanik', capability), capability).toBe(false);
    }
  });

  test('only the admin sees prices', () => {
    expect(canSeePrices('admin')).toBe(true);
    expect(canSeePrices('mechanik')).toBe(false);
  });

  test('a password is 8 to 128 characters long, with no rule on what they are', () => {
    expect(passwordLength).toEqual({ min: 8, max: 128 });
    expect(passwordError('')).toBe('tooShort');
    expect(passwordError('1234567')).toBe('tooShort');
    expect(passwordError('12345678')).toBeNull();
    expect(passwordError('a'.repeat(128))).toBeNull();
    expect(passwordError('a'.repeat(129))).toBe('tooLong');
    expect(passwordError('        ')).toBeNull();
  });
});

describe('Nový používateľ', () => {
  const valid: NewUserInput = { name: 'Ján Novák', email: 'jan@autoservis.sk', role: 'mechanik', password: 'heslo-1234' };

  test('a user with a name, an e-mail, a role and a password is accepted as typed, but for the e-mail in lower case and the name trimmed', () => {
    expect(parseNewUser(valid)).toEqual({ ok: true, user: valid });
    expect(parseNewUser({ ...valid, name: '  Ján Novák ', email: ' Jan@AutoServis.SK ', role: 'admin' })).toEqual({
      ok: true,
      user: { ...valid, role: 'admin' },
    });
  });

  test('a password is stored as typed, spaces at its ends included', () => {
    expect(parseNewUser({ ...valid, password: '  heslo 1234  ' })).toEqual({ ok: true, user: { ...valid, password: '  heslo 1234  ' } });
  });

  test('a name is required, and a name of spaces is none', () => {
    expect(parseNewUser({ ...valid, name: '' })).toEqual({ ok: false, errors: { name: 'required' } });
    expect(parseNewUser({ ...valid, name: '   ' })).toEqual({ ok: false, errors: { name: 'required' } });
  });

  test.each(['', 'jan', 'jan@', '@autoservis.sk', 'jan@autoservis', 'jan novak@autoservis.sk', 'jan@@autoservis.sk'])('the e-mail "%s" is refused', (email) => {
    expect(parseNewUser({ ...valid, email })).toEqual({ ok: false, errors: { email: 'format' } });
  });

  test('a role that is neither admin nor mechanik is refused, and so is none', () => {
    expect(parseNewUser({ ...valid, role: 'user' })).toEqual({ ok: false, errors: { role: 'invalid' } });
    expect(parseNewUser({ ...valid, role: '' })).toEqual({ ok: false, errors: { role: 'invalid' } });
    expect(parseNewUser({ ...valid, role: 'admin,mechanik' })).toEqual({ ok: false, errors: { role: 'invalid' } });
  });

  test('a password of 7 characters is too short, of 8 and of 128 it is fine, of 129 it is too long', () => {
    expect(parseNewUser({ ...valid, password: '1234567' })).toEqual({ ok: false, errors: { password: 'tooShort' } });
    expect(parseNewUser({ ...valid, password: '12345678' })).toMatchObject({ ok: true });
    expect(parseNewUser({ ...valid, password: 'a'.repeat(128) })).toMatchObject({ ok: true });
    expect(parseNewUser({ ...valid, password: 'a'.repeat(129) })).toEqual({ ok: false, errors: { password: 'tooLong' } });
  });

  test('every reason comes back at once', () => {
    expect(parseNewUser({ name: '', email: 'x', role: 'x', password: '' })).toEqual({
      ok: false,
      errors: { name: 'required', email: 'format', role: 'invalid', password: 'tooShort' },
    });
  });
});

describe('Úprava používateľa', () => {
  const valid: UserEditInput = { name: 'Ján Novák', email: 'jan@autoservis.sk', role: 'mechanik' };

  test('a name, an e-mail and a role are accepted as typed, but for the e-mail in lower case and the name trimmed', () => {
    expect(parseUserEdit(valid)).toEqual({ ok: true, edit: valid });
    expect(parseUserEdit({ name: '  Ján Novák ', email: ' Jan@AutoServis.SK ', role: 'admin' })).toEqual({
      ok: true,
      edit: { ...valid, role: 'admin' },
    });
  });

  test('no role means the Rola stays as it is, so the edit carries none', () => {
    expect(parseUserEdit({ name: 'Ján Novák', email: 'jan@autoservis.sk' })).toEqual({ ok: true, edit: { name: 'Ján Novák', email: 'jan@autoservis.sk' } });
  });

  test('a name is required, and a name of spaces is none', () => {
    expect(parseUserEdit({ ...valid, name: '   ' })).toEqual({ ok: false, errors: { name: 'required' } });
  });

  test.each(['', 'jan', 'jan@', '@autoservis.sk', 'jan@autoservis', 'jan novak@autoservis.sk'])('the e-mail "%s" is refused', (email) => {
    expect(parseUserEdit({ ...valid, email })).toEqual({ ok: false, errors: { email: 'format' } });
  });

  // A role that was sent must be one of ours: an empty one is not "none", it is a form that sent nothing valid.
  test.each(['user', '', 'admin,mechanik'])('the role "%s" is refused', (role) => {
    expect(parseUserEdit({ ...valid, role })).toEqual({ ok: false, errors: { role: 'invalid' } });
  });

  test('every reason comes back at once', () => {
    expect(parseUserEdit({ name: '', email: 'x', role: 'x' })).toEqual({ ok: false, errors: { name: 'required', email: 'format', role: 'invalid' } });
  });
});
