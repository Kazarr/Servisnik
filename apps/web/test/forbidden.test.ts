import { expect, test, vi } from 'vitest';
import { forbiddenMessage, orForbidden } from '../src/app/(app)/forbidden.ts';
import * as settingsActions from '../src/app/(app)/nastavenia/actions.ts';
import * as userActions from '../src/app/(app)/nastavenia/user-actions.ts';
import * as vehicleActions from '../src/app/(app)/vozidla/actions.ts';
import * as workOrderActions from '../src/app/(app)/zakazky/actions.ts';
import * as customerActions from '../src/app/(app)/zakaznici/actions.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';

// What a Server Action answers when the DAL refuses the user's Rola: the message, and nothing changed
// (docs/adr/0001-stack.md, packages/domain/src/access). Fast tier; e2e/mechanik.spec.ts proves the
// same in a browser.

// The actions run as a mechanik. The DAL is the real one: it refuses before it touches the database
// or Better Auth, and the ones it is handed record every property read from them (the Better Auth
// of the DAL is built from the environment, which this fast tier does not have).
const { touched, watched } = vi.hoisted(() => {
  const touched: string[] = [];
  return { touched, watched: (what: string) => new Proxy({}, { get: (_target, property) => (touched.push(`${what}.${String(property)}`), undefined) }) };
});
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).mechanic }));
vi.mock('../src/db/index.ts', () => ({ getDb: () => watched('db') }));
vi.mock('../src/auth.ts', () => ({ getAuth: () => watched('auth') }));

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
  saveWorkshopDetailsAction: {
    call: () => settingsActions.saveWorkshopDetailsAction(null, form({ name: 'Autoservis Novák', vatPayerType: 'nonPayer' })),
    answer: formRefused,
  },
  createUserAction: {
    call: () =>
      userActions.createUserAction(null, form({ newUserName: 'Nový Mechanik', newUserEmail: 'novy@autoservis.test', newUserRole: 'mechanik', newUserPassword: 'pociatocne-heslo-1234' })),
    answer: formRefused,
  },
};

// Every file under app/(app) whose first statement is 'use server', whatever it is called: found by the file system rather than listed or named, so that a new one is not missed.
const sources = import.meta.glob<string>('../src/app/[(]app[)]/**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' });
const loaders = import.meta.glob<Record<string, unknown>>('../src/app/[(]app[)]/**/*.{ts,tsx}');
const startsWithUseServer = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(['"])use server\1/;
const actionFiles = Object.keys(sources).filter((file) => startsWithUseServer.test(sources[file]!));
/**
 * Server Actions the DAL does not refuse a mechanik: signOut uses no DAL, and changePassword needs
 * `password.change`, which is on the mechanik's list.
 */
const notRefusedToMechanik = ['signOut', 'changePassword'];

test('the first statement of a file is read as use server, with comments before it, and not when it comes later', () => {
  expect(startsWithUseServer.test("'use server';\nexport const a = 1;")).toBe(true);
  expect(startsWithUseServer.test('"use server"\n')).toBe(true);
  expect(startsWithUseServer.test("// Actions\n/* of the form */\n'use server';")).toBe(true);
  expect(startsWithUseServer.test("import { a } from 'a';\n'use server';")).toBe(false);
  expect(startsWithUseServer.test("export const text = 'use server';")).toBe(false);
});

test('the table has a row for every Server Action of every file under app/(app) that starts with use server and that the DAL can refuse a mechanik, and for nothing else', async () => {
  expect(actionFiles.length).toBeGreaterThan(0);

  const modules = await Promise.all(actionFiles.map((file) => loaders[file]!()));
  const exported = modules.flatMap((module) => Object.keys(module));

  expect(exported.filter((name) => !notRefusedToMechanik.includes(name)).sort()).toEqual(Object.keys(actions).sort());
});

test.each(Object.entries(actions))('%s answers a mechanik with the message and reads and writes nothing', async (_name, { call, answer }) => {
  touched.length = 0;

  expect(await call()).toEqual(answer);

  expect(touched).toEqual([]);
});
