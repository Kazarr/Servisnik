import { parseCustomer, type CustomerInput } from '@servisnik/domain/customer';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

export type CreateCustomerResult = { ok: true; id: string } | { ok: false; errors: { name: 'required' } };

/** Saves a Zákazník; the domain decides what is stored (packages/domain/src/customer). */
export async function createCustomer(
  user: User | null,
  input: CustomerInput,
  db: Database = getDb(),
): Promise<CreateCustomerResult> {
  assertCan(user, 'customers.write');
  const parsed = parseCustomer(input);
  if (!parsed.ok) return parsed;
  const [saved] = await db.insert(customer).values(parsed.customer).returning({ id: customer.id });
  return { ok: true, id: saved!.id };
}

/** Every Zákazník, newest first. */
export async function listCustomers(user: User | null, db: Database = getDb()) {
  assertCan(user, 'customers.read');
  return db.select().from(customer).orderBy(desc(customer.createdAt));
}

/** One Zákazník with the Vozidlá they own (newest first), or null when there is none with this id. */
export async function getCustomer(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'customers.read');
  if (!isUuid(id)) return null;
  const [found] = await db.select().from(customer).where(eq(customer.id, id));
  if (!found) return null;
  const vehicles = await db.select().from(vehicle).where(eq(vehicle.ownerId, id)).orderBy(desc(vehicle.createdAt));
  return { ...found, vehicles };
}
