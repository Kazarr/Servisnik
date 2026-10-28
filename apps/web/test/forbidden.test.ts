import { expect, test, vi } from 'vitest';
import * as customerActions from '../src/app/(app)/zakaznici/actions.ts';
import * as vehicleActions from '../src/app/(app)/vozidla/actions.ts';
import * as workOrderActions from '../src/app/(app)/zakazky/actions.ts';
import { forbiddenMessage, orForbidden } from '../src/app/(app)/forbidden.ts';
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
 * One row per exported Server Action of the three areas, sent with a form that would succeed for an
 * admin, and what it answers a mechanik. A new action needs its row, or the first test fails.
 */
const actions = {
  addCustomer: { call: () => customerActions.addCustomer(null, form({ type: 'person', name: 'Ján Novák' })), answer: formRefused },
  editCustomer: { call: () => customerActions.editCustomer(null, form({ id, type: 'person', name: 'Premenovaný' })), answer: formRefused },
  addVehicle: { call: () => vehicleActions.addVehicle(null, form({ ownerId: id, vin: 'TMBZZZ5JZ3W000101', make: 'Škoda', model: 'Octavia' })), answer: formRefused },
  openWorkOrder: {
    call: () => workOrderActions.openWorkOrder(null, form({ vehicleId: id, customerId: id, mileageKm: '1', customerRequest: 'Brzdy' })),
    answer: formRefused,
  },
  addWorkToOrder: {
    call: () => workOrderActions.addWorkToOrder(null, form({ workOrderId: id, name: 'Brzdy', quantity: '1', unitPrice: '10', vatRate: '23' })),
    answer: formRefused,
  },
  markDone: { call: () => workOrderActions.markDone(null, form({ workOrderId: id })), answer: { error: forbiddenMessage } },
};

test('the table has a row for every exported Server Action of the Zákazníci, Vozidlá and Zákazky, and for nothing else', () => {
  const exported = [customerActions, vehicleActions, workOrderActions].flatMap((module) => Object.keys(module));

  expect(exported.sort()).toEqual(Object.keys(actions).sort());
});

test.each(Object.entries(actions))('%s answers a mechanik with the message and reads and writes nothing', async (_name, { call, answer }) => {
  touched.length = 0;

  expect(await call()).toEqual(answer);

  expect(touched).toEqual([]);
});
