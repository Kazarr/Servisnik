import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import * as customers from '../src/dal/customers.ts';
import { ForbiddenError, UnauthenticatedError, type User } from '../src/dal/user.ts';
import * as vehicles from '../src/dal/vehicles.ts';
import * as workOrders from '../src/dal/work-orders.ts';
import type { Database } from '../src/db/index.ts';
import { customer, vehicle, workOrder, workOrderCounter, workOrderItem } from '../src/db/schema.ts';
import { createTestDb } from './support/db.ts';
import { findPriceKeys } from './support/price-keys.ts';

// Every function of the Data Access Layer checks the Rola's capability, not only the sign-in
// (docs/adr/0001-stack.md, packages/domain/src/access). This is the one table that proves it.

const admin: User = { id: 'user-1', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };
const mechanik: User = { id: 'user-2', email: 'mechanik@autoservis.test', name: 'Mechanik', role: 'mechanik' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let vehicleId: string;
let orderId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  ownerId = idOf(await customers.createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await vehicles.createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
  orderId = idOf(await workOrders.createWorkOrder(admin, { vehicleId, mileageKm: '123 456', customerRequest: 'Výmena oleja' }, ctx.db));
  idOf(await workOrders.addLabour(admin, orderId, { name: 'Výmena oleja', quantity: '1,5', unitPrice: '40', vatRate: '23' }, ctx.db));
});
afterAll(() => ctx.close());

function idOf(result: { ok: true; id: string } | { ok: false }) {
  if (!result.ok) throw new Error('The record was expected to be saved.');
  return result.id;
}

type Call = (user: User | null, db: Database) => Promise<unknown>;

/** One row per exported function of the DAL, called with arguments that would succeed for an admin. A new function needs its row, or the first test fails. */
const calls: Record<string, Call> = {
  createCustomer: (user, db) => customers.createCustomer(user, { type: 'person', name: 'Ján Novák' }, db),
  updateCustomer: (user, db) => customers.updateCustomer(user, ownerId, { type: 'person', name: 'Premenovaný' }, db),
  listCustomers: (user, db) => customers.listCustomers(user, db),
  getCustomer: (user, db) => customers.getCustomer(user, ownerId, db),
  createVehicle: (user, db) => vehicles.createVehicle(user, { ownerId, vin: 'TMBZZZ5JZ3W000101', licensePlate: '', make: 'Škoda', model: 'Octavia' }, db),
  listVehicles: (user, db) => vehicles.listVehicles(user, db),
  getVehicle: (user, db) => vehicles.getVehicle(user, vehicleId, db),
  createWorkOrder: (user, db) => workOrders.createWorkOrder(user, { vehicleId, mileageKm: '1', customerRequest: 'Brzdy' }, db),
  addLabour: (user, db) => workOrders.addLabour(user, orderId, { name: 'Brzdy', quantity: '1', unitPrice: '10', vatRate: '23' }, db),
  markWorkOrderDone: (user, db) => workOrders.markWorkOrderDone(user, orderId, db),
  getWorkOrder: (user, db) => workOrders.getWorkOrder(user, orderId, db),
  listWorkOrders: (user, db) => workOrders.listWorkOrders(user, db),
  listOpenWorkOrdersOfVehicle: (user, db) => workOrders.listOpenWorkOrdersOfVehicle(user, vehicleId, db),
};

/** The functions on the mechanik's list of capabilities; every other one is forbidden to him. */
const mechanikMay = ['listWorkOrders'];

const dataAccess = { 'customers.ts': customers, 'vehicles.ts': vehicles, 'work-orders.ts': workOrders };
/** Files of src/dal that hold no data access: the user, the id check and the page-side wrapper. */
const helperFiles = ['current-user.ts', 'user.ts', 'uuid.ts'];

test('the table has a row for every exported function of every data access module', () => {
  const files = readdirSync(new URL('../src/dal/', import.meta.url)).filter((file) => !helperFiles.includes(file));
  expect(files.sort()).toEqual(Object.keys(dataAccess).sort());

  const exported = Object.values(dataAccess).flatMap((module) => Object.entries(module).filter(([, value]) => typeof value === 'function').map(([name]) => name));
  expect(exported.sort()).toEqual(Object.keys(calls).sort());
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
});

test.each(Object.entries(calls).filter(([name]) => !mechanikMay.includes(name)))(
  '%s is forbidden to the mechanik, who reads and writes nothing',
  async (_name, call) => {
    const before = await everything();
    const spy = watched(ctx.db);

    await expect(call(mechanik, spy.db)).rejects.toBeInstanceOf(ForbiddenError);

    expect(spy.touched).toEqual([]);
    expect(await everything()).toEqual(before);
  },
);

test.each(Object.entries(calls))('%s rejects a missing user as not signed in, not as forbidden', async (_name, call) => {
  const spy = watched(ctx.db);

  await expect(call(null, spy.db)).rejects.toBeInstanceOf(UnauthenticatedError);

  expect(spy.touched).toEqual([]);
});

test('the mechanik reads the list of Zákazky with its number, customer, vehicle and status, and no price key anywhere in it', async () => {
  const list = await workOrders.listWorkOrders(mechanik, ctx.db);

  expect(list).toEqual([
    {
      id: orderId,
      number: expect.stringMatching(/^Z\d{4}-0001$/),
      status: 'received',
      customer: { id: ownerId, name: 'Firma s.r.o.' },
      vehicle: { id: vehicleId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    },
  ]);
  expect(findPriceKeys(list)).toEqual([]);
});

test('the helper does see the prices the admin gets from the same database', async () => {
  expect(findPriceKeys(await workOrders.getWorkOrder(admin, orderId, ctx.db))).toContain('$.totals');
});
