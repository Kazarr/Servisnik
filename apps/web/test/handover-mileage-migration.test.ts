import { rmSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrateDatabase } from '../src/db/migrate.ts';
import { createTestDb } from './support/db.ts';
import { migrationsUpTo } from './support/migrations.ts';

// The migration that gives a Zákazka its Kilometre pri odovzdaní (GLOSSARY, #164) meets Zákazky that exist already, and they lose
// nothing and get none. The migrated test database is empty, so the migration is run here on a database that has the Zákazky first
// (testing-strategy: a migration is tested on rows that exist before it).

const before = '0017_work_order_item_added_seq'; // the last migration before the one this file tests

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb({ migrated: false });
});
afterAll(() => ctx.close());

test('Zákazky that exist before the migration keep all they had and have no kilometres at handover; they can have them after it, but not below 0', async () => {
  const folder = migrationsUpTo(before);
  try {
    await migrate(ctx.db, { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true });
  }
  const [customer] = (await ctx.db.execute<{ id: string }>(sql`insert into customer (type, name, search_name, search_email, search_phone) values ('person', 'Ján Novák', '', '', '') returning id`)).rows;
  const [vehicle] = (await ctx.db.execute<{ id: string }>(sql`insert into vehicle (vin, owner_id, make, model, mileage_km) values ('TMBZZZ5JZ3W000001', ${customer!.id}, 'Škoda', 'Octavia', 123456) returning id`)).rows;
  await ctx.db.execute(sql`
    insert into work_order (number, customer_id, vehicle_id, mileage_km, customer_request, status, completed_on, deadline, note)
    values ('Z2026-0001', ${customer!.id}, ${vehicle!.id}, 123456, 'Výmena oleja', 'done', '2026-10-20', '2026-10-21', 'Interná poznámka')`);

  await migrateDatabase(ctx.db);

  const { rows } = await ctx.db.execute(sql`select number, mileage_km, customer_request, status, completed_on::text, deadline::text, note, handover_mileage_km from work_order`);
  expect(rows).toEqual([
    { number: 'Z2026-0001', mileage_km: 123456, customer_request: 'Výmena oleja', status: 'done', completed_on: '2026-10-20', deadline: '2026-10-21', note: 'Interná poznámka', handover_mileage_km: null },
  ]);
  await ctx.db.execute(sql`update work_order set handover_mileage_km = 123600`);
  expect((await ctx.db.execute(sql`select handover_mileage_km from work_order`)).rows).toEqual([{ handover_mileage_km: 123600 }]);
  await expect(ctx.db.execute(sql`update work_order set handover_mileage_km = -1`)).rejects.toThrow(); // below 0 is refused, as it is for the kilometres at intake
});
