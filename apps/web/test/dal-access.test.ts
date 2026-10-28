import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import * as constraintModule from '../src/dal/constraint.ts';
import * as currentUserModule from '../src/dal/current-user.ts';
import * as customers from '../src/dal/customers.ts';
import * as logo from '../src/dal/logo.ts';
import * as paging from '../src/dal/paging.ts';
import * as password from '../src/dal/password.ts';
import * as settings from '../src/dal/settings.ts';
import * as userModule from '../src/dal/user.ts';
import { ForbiddenError, UnauthenticatedError, type User } from '../src/dal/user.ts';
import * as users from '../src/dal/users.ts';
import * as uuidModule from '../src/dal/uuid.ts';
import * as vehicles from '../src/dal/vehicles.ts';
import * as workOrders from '../src/dal/work-orders.ts';
import * as workshopDetails from '../src/dal/workshop.ts';
import type { Database } from '../src/db/index.ts';
import { account, customer, user as userTable, vehicle, workOrder, workOrderCounter, workOrderItem, workshop, workshopLogo } from '../src/db/schema.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { jpeg, png } from './support/logo-files.ts';
import { findPriceKeys } from './support/price-keys.ts';

// Every function of the Data Access Layer checks the Rola's capability, not only the sign-in
// (docs/adr/0001-stack.md, packages/domain/src/access). This is the one table that proves it.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
let ownerId: string;
let vehicleId: string;
let idleCustomerId: string;
let idleVehicleId: string;
let orderId: string;
let itemId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  auth = createAuth({ db: ctx.db, secret: 'test-secret-test-secret-test-secret-0123' }); // on the real db, so that building it is not a touch of the watched one
  ownerId = idOf(await customers.createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await vehicles.createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
  idleCustomerId = idOf(await customers.createCustomer(admin, { type: 'person', name: 'Bez väzieb' }, ctx.db)); // nothing links to these two, so an admin may delete them
  idleVehicleId = idOf(await vehicles.createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000202', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  orderId = idOf(await workOrders.createWorkOrder(admin, { vehicleId, mileageKm: '123 456', customerRequest: 'Výmena oleja' }, ctx.db));
  itemId = idOf(await workOrders.addItem(admin, orderId, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', unitPrice: '40', vatRate: '23' }, ctx.db));
  await logo.saveLogo(admin, png, ctx.db); // there is a logo for the mechanik to try to read past his capability, replace or remove
});
afterAll(() => ctx.close());

type Call = (user: User | null, db: Database) => Promise<unknown>;

/** One row per exported function of the DAL, called with arguments that would succeed for an admin. A new function needs its row, or the first test fails. */
const calls: Record<string, Call> = {
  createCustomer: (user, db) => customers.createCustomer(user, { type: 'person', name: 'Ján Novák' }, db),
  updateCustomer: (user, db) => customers.updateCustomer(user, ownerId, { type: 'person', name: 'Premenovaný' }, db),
  deleteCustomer: (user, db) => customers.deleteCustomer(user, idleCustomerId, db),
  listCustomers: (user, db) => customers.listCustomers(user, db),
  searchCustomers: (user, db) => customers.searchCustomers(user, { query: 'Firma' }, db),
  getCustomer: (user, db) => customers.getCustomer(user, ownerId, db),
  createVehicle: (user, db) => vehicles.createVehicle(user, { ownerId, vin: 'TMBZZZ5JZ3W000101', licensePlate: '', make: 'Škoda', model: 'Octavia' }, db),
  updateVehicle: (user, db) =>
    vehicles.updateVehicle(user, vehicleId, { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Passat' }, db),
  deleteVehicle: (user, db) => vehicles.deleteVehicle(user, idleVehicleId, db),
  searchVehicles: (user, db) => vehicles.searchVehicles(user, { query: 'WVW' }, db),
  getVehicle: (user, db) => vehicles.getVehicle(user, vehicleId, db),
  createWorkOrder: (user, db) => workOrders.createWorkOrder(user, { vehicleId, mileageKm: '1', customerRequest: 'Brzdy' }, db),
  // Whether a mechanik may change the header or the states is ledger question 11 (#43): until it is answered the capability is the admin's alone.
  updateWorkOrderHeader: (user, db) =>
    workOrders.updateWorkOrderHeader(user, orderId, { mileageKm: '2', customerRequest: 'Nová požiadavka', deadline: '2026-12-01', note: 'Poznámka' }, db),
  addItem: (user, db) => workOrders.addItem(user, orderId, { kind: 'labour', name: 'Brzdy', quantity: '1', unitPrice: '10', vatRate: '23' }, db),
  updateItem: (user, db) => workOrders.updateItem(user, itemId, { name: 'Brzdy', quantity: '2', unitPrice: '12' }, db),
  deleteItem: (user, db) => workOrders.deleteItem(user, itemId, db),
  changeWorkOrderStatus: (user, db) => workOrders.changeWorkOrderStatus(user, orderId, { to: 'inProgress' }, db),
  getWorkOrder: (user, db) => workOrders.getWorkOrder(user, orderId, db),
  listWorkOrders: (user, db) => workOrders.listWorkOrders(user, { status: 'all', from: '2026-01-01', page: 1 }, db),
  listWorkOrdersOfVehicle: (user, db) => workOrders.listWorkOrdersOfVehicle(user, vehicleId, db),
  listWorkOrdersOfCustomer: (user, db) => workOrders.listWorkOrdersOfCustomer(user, ownerId, db),
  getRates: (user, db) => settings.getRates(user, db),
  saveRates: (user, db) => settings.saveRates(user, { vatRates: '23\n19', defaultVatRate: '19', hourlyRate: '40', markup: '10' }, db),
  getWorkshopDetails: (user, db) => workshopDetails.getWorkshopDetails(user, db),
  getVatPayerType: (user, db) => workshopDetails.getVatPayerType(user, db),
  saveWorkshopDetails: (user, db) =>
    workshopDetails.saveWorkshopDetails(
      user,
      { name: 'Autoservis Novák', street: '', city: '', postalCode: '', ico: '', dic: '', icDph: '', vatPayerType: 'nonPayer', iban: '', phone: '', email: '', commercialRegister: '' },
      db,
    ),
  getLogo: (user, db) => logo.getLogo(user, db),
  getLogoInfo: (user, db) => logo.getLogoInfo(user, db),
  saveLogo: (user, db) => logo.saveLogo(user, jpeg, db),
  removeLogo: (user, db) => logo.removeLogo(user, db),
  // The list reads the database it is given; the creation goes through Better Auth, which has the real database of the test, so only what it wrote shows (`everything`).
  listUsers: (user, db) => users.listUsers(user, db),
  createUser: (user) => users.createUser(user, { name: 'Nový Mechanik', email: 'novy@autoservis.test', role: 'mechanik', password: 'pociatocne-heslo-1234' }, auth),
  // Takes no user: it is the one the session in the headers names, so the row has none (the headers carry no session, as for a missing user).
  changeOwnPassword: () =>
    password.changeOwnPassword(new Headers(), { currentPassword: 'povodne-heslo-1234', newPassword: 'nove-heslo-5678', confirmation: 'nove-heslo-5678' }, auth),
};

/** The functions on the mechanik's list of capabilities; every other one is forbidden to him. */
const mechanikMay = ['listWorkOrders', 'changeOwnPassword', 'getLogo', 'getWorkshopDetails', 'getVatPayerType'];

/** The files of src/dal that read and write data: each of their exports, a function or not, has a row in `calls`. */
const dataAccess = {
  'customers.ts': customers,
  'logo.ts': logo,
  'password.ts': password,
  'settings.ts': settings,
  'users.ts': users,
  'vehicles.ts': vehicles,
  'work-orders.ts': workOrders,
  'workshop.ts': workshopDetails,
};
/**
 * The files of src/dal that hold no data access, with their exports pinned by name: the refused
 * constraint, the paging of the lists, the user, the id check and the page-side wrapper. An export added to one of them fails
 * the test below, so whoever adds it decides: a function that reads or writes data goes in a data
 * access file and in `calls`, anything else goes in this list.
 */
const helpers = {
  'constraint.ts': { module: constraintModule, exports: ['blockedByLink', 'violates'] },
  'current-user.ts': { module: currentUserModule, exports: ['currentUser', 'currentUserWith'] },
  'paging.ts': { module: paging, exports: ['contains', 'pageSize', 'pageWindow'] },
  'user.ts': { module: userModule, exports: ['ForbiddenError', 'UnauthenticatedError', 'assertCan', 'homePage', 'requireUser'] },
  'uuid.ts': { module: uuidModule, exports: ['isUuid'] },
};

test('every file of src/dal is either a data access file or a helper with its exports pinned', () => {
  const files = readdirSync(new URL('../src/dal/', import.meta.url));
  expect(files.sort()).toEqual([...Object.keys(dataAccess), ...Object.keys(helpers)].sort());
});

test('the table has a row for every export of every data access file, and no row for anything else', () => {
  const exported = Object.values(dataAccess).flatMap((module) => Object.keys(module));
  expect(exported.sort()).toEqual(Object.keys(calls).sort());
});

test.each(Object.entries(helpers))('%s exports nothing but what is pinned', (_file, { module, exports }) => {
  expect(Object.keys(module).sort()).toEqual([...exports].sort());
});

/** Hands `db` to a function and records every property it touched: a function that never touches it read and wrote nothing. */
function watched(db: Database) {
  const touched: string[] = [];
  return { db: new Proxy(db, { get: (target, property, receiver) => (touched.push(String(property)), Reflect.get(target, property, receiver)) }), touched };
}

const everything = async () => ({
  customers: await ctx.db.select().from(customer),
  vehicles: await ctx.db.select().from(vehicle),
  workOrders: await ctx.db.select().from(workOrder),
  items: await ctx.db.select().from(workOrderItem),
  counters: await ctx.db.select().from(workOrderCounter),
  workshop: await ctx.db.select().from(workshop),
  workshopLogo: await ctx.db.select().from(workshopLogo),
  users: await ctx.db.select().from(userTable),
  accounts: await ctx.db.select().from(account),
});

test.each(Object.entries(calls).filter(([name]) => !mechanikMay.includes(name)))(
  '%s is forbidden to the mechanik, who reads and writes nothing',
  async (_name, call) => {
    const before = await everything();
    const spy = watched(ctx.db);

    await expect(call(mechanic, spy.db)).rejects.toBeInstanceOf(ForbiddenError);

    expect(spy.touched).toEqual([]);
    expect(await everything()).toEqual(before);
  },
);

test.each(Object.entries(calls))('%s rejects a missing user as not signed in, not as forbidden', async (_name, call) => {
  const spy = watched(ctx.db);

  await expect(call(null, spy.db)).rejects.toBeInstanceOf(UnauthenticatedError);

  expect(spy.touched).toEqual([]);
});

test('the mechanik reads the list of Zákazky with its number, customer, vehicle, status and Termín, and no price key anywhere in it', async () => {
  const list = await workOrders.listWorkOrders(mechanic, {}, ctx.db);

  expect(list).toEqual({
    orders: [
      {
        id: orderId,
        number: expect.stringMatching(/^Z\d{4}-0001$/),
        status: 'received',
        deadline: null,
        customer: { id: ownerId, name: 'Firma s.r.o.' },
        vehicle: { id: vehicleId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
      },
    ],
    page: 1,
    pageCount: 1,
    orderCount: 1,
    filter: { status: 'unclosed', from: null, to: null },
  });
  expect(findPriceKeys(list)).toEqual([]);
});

test('the helper does see the prices the admin gets from the same database', async () => {
  expect(findPriceKeys(await workOrders.getWorkOrder(admin, orderId, ctx.db))).toContain('$.totals');
});
