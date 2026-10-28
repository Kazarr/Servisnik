import { expect, test, vi } from 'vitest';
import { forbiddenMessage, orForbidden } from '../src/app/(app)/forbidden.ts';
import * as settingsActions from '../src/app/(app)/nastavenia/actions.ts';
import * as vehicleActions from '../src/app/(app)/vozidla/actions.ts';
import * as workOrderActions from '../src/app/(app)/zakazky/actions.ts';
import * as customerActions from '../src/app/(app)/zakaznici/actions.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';

// What a Server Action answers when the DAL refuses the user's Rola: the message, and nothing changed
// (docs/adr/0001-stack.md, packages/domain/src/access). Fast tier; e2e/mechanik.spec.ts proves the
// same in a browser.

// The actions run as a mechanik. The DAL is the real one: it refuses before it touches the database,
// and the database it is handed records every property read from it.
const { touched } = vi.hoisted(() => ({ touched: [] as string[] }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).mechanic }));
vi.mock('../src/db/index.ts', () => ({ getDb: () => new Proxy({}, { get: (_target, property) => (touched.push(String(property)), undefined) }) }));

test('orForbidden gives the result of the call', async () => {
  expect(await orForbidden(Promise.resolve({ ok: true }))).toEqual({ ok: true });
});

test('orForbidden turns a call refused for the Rola into forbidden', async () => {
  expect(await orForbidden(Promise.reject(new ForbiddenError('customers.write')))).toBe('forbidden');
});

test('orForbidden lets any other failure through, a missing sign-in too', async () => {
  await expect(orForbidden(Promise.reject(new UnauthenticatedError()))).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(orForbidden(Promise.reject(new Error('connect ECONNREFUSED')))).rejects.toThrow('connect ECONNREFUSED');
});

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const id = '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10';
/** The state of a form that was refused: the message on the form, next to the values that were sent. */
const formRefused = expect.objectContaining({ errors: { form: forbiddenMessage } });

/**
 * One row per Server Action the DAL can refuse a mechanik, sent with a form that would succeed for an
 * admin, and what it answers him. A new action needs its row, or the first test fails.
 */
const actions = {
  addCustomer: { call: () => customerActions.addCustomer(null, form({ type: 'person', name: 'Ján Novák' })), answer: formRefused },
  editCustomer: { call: () => customerActions.editCustomer(null, form({ id, type: 'person', name: 'Premenovaný' })), answer: formRefused },
  addVehicle: { call: () => vehicleActions.addVehicle(null, form({ ownerId: id, vin: 'TMBZZZ5JZ3W000101', make: 'Škoda', model: 'Octavia' })), answer: formRefused },
  editVehicle: { call: () => vehicleActions.editVehicle(null, form({ id, vin: 'TMBZZZ5JZ3W000101', make: 'Škoda', model: 'Fabia' })), answer: formRefused },
  addWorkOrder: {
    call: () => workOrderActions.addWorkOrder(null, form({ vehicleId: id, customerId: id, mileageKm: '1', customerRequest: 'Brzdy' })),
    answer: formRefused,
  },
  addLabourToWorkOrder: {
    call: () => workOrderActions.addLabourToWorkOrder(null, form({ workOrderId: id, name: 'Brzdy', quantity: '1', unitPrice: '10', vatRate: '23' })),
    answer: formRefused,
  },
  changeStatus: { call: () => workOrderActions.changeStatus(null, form({ workOrderId: id, to: 'done' })), answer: { error: forbiddenMessage } },
  saveRatesAction: {
    call: () => settingsActions.saveRatesAction(null, form({ vatRates: '23\n19', defaultVatRate: '19', hourlyRate: '40', markup: '10' })),
    answer: formRefused,
  },
};

// Every actions.ts under app/(app), found by the file system rather than listed, so that a new one is not missed.
const actionFiles = import.meta.glob<Record<string, unknown>>('../src/app/[(]app[)]/**/actions.ts', { eager: true });
/**
 * Server Actions the DAL does not refuse a mechanik: signOut uses no DAL, and changePassword needs
 * `password.change`, which is on the mechanik's list.
 */
const notRefusedToMechanik = ['signOut', 'changePassword'];

test('the table has a row for every Server Action of every actions.ts under app/(app) that the DAL can refuse a mechanik, and for nothing else', () => {
  expect(Object.keys(actionFiles).length).toBeGreaterThan(0);

  const exported = Object.values(actionFiles).flatMap((module) => Object.keys(module));

  expect(exported.filter((name) => !notRefusedToMechanik.includes(name)).sort()).toEqual(Object.keys(actions).sort());
});

test.each(Object.entries(actions))('%s answers a mechanik with the message and reads and writes nothing', async (_name, { call, answer }) => {
  touched.length = 0;

  expect(await call()).toEqual(answer);

  expect(touched).toEqual([]);
});
