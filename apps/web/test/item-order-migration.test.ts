import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, expect, inject, test } from 'vitest';
import { createDb, type Database } from '../src/db/index.ts';
import { migrateDatabase } from '../src/db/migrate.ts';
import { withDatabase } from './support/postgres.ts';

// The migration that gives every Položka zákazky its place in the order they were added (#160) meets items that exist
// already, and they keep the order the app showed: by `created_at`, and by `id` where two have the same one. The
// migrated test database is empty, so the migration is run here on a database that has the items first
// (testing-strategy: a data migration is tested on rows that exist before it).

const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));
const before = '0016_joy_ride'; // the last migration before the one this file tests

let db: Database;
let dropDatabase: () => Promise<void>;
beforeAll(async () => {
  const uri = inject('pgUri');
  const name = `t_${randomUUID().replaceAll('-', '')}`;
  const maintenance = new pg.Client({ connectionString: uri });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE ${name}`);

  db = createDb(withDatabase(uri, name));
  dropDatabase = async () => {
    await db.$client.end();
    await maintenance.query(`DROP DATABASE ${name}`);
    await maintenance.end();
  };
});
afterAll(() => dropDatabase());

/** A copy of the migrations folder whose journal ends with `tag`: the database as it was before the next migration. */
function migrationsUpTo(tag: string) {
  const copy = mkdtempSync(join(tmpdir(), 'migrations-'));
  cpSync(migrations, copy, { recursive: true });
  const journalFile = join(copy, 'meta', '_journal.json');
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(journalFile, 'utf8'));
  journal.entries = journal.entries.slice(0, journal.entries.findIndex((entry) => entry.tag === tag) + 1);
  writeFileSync(journalFile, JSON.stringify(journal));
  return copy;
}

/** The names of the items of a Zákazka in the order of their place. */
const placed = async (workOrderId: string) =>
  (await db.execute<{ name: string }>(sql`select name from work_order_item where work_order_id = ${workOrderId} order by added_seq`)).rows.map((row) => row.name);

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('items that exist before the migration keep the order the app showed, by created_at and then by id, and an item added after it comes last', async () => {
  const folder = migrationsUpTo(before);
  try {
    await migrate(db, { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true });
  }

  const [customer] = (await db.execute<{ id: string }>(sql`insert into customer (type, name, search_name, search_email, search_phone) values ('person', 'Ján Novák', '', '', '') returning id`)).rows;
  const [vehicle] = (await db.execute<{ id: string }>(sql`insert into vehicle (vin, owner_id, make, model) values ('TMBZZZ5JZ3W000001', ${customer!.id}, 'Škoda', 'Octavia') returning id`)).rows;
  const workOrderIds: string[] = [];
  for (const number of ['Z2026-0001', 'Z2026-0002']) {
    const [saved] = (
      await db.execute<{ id: string }>(
        sql`insert into work_order (number, customer_id, vehicle_id, mileage_km, customer_request) values (${number}, ${customer!.id}, ${vehicle!.id}, 1000, 'Výmena oleja') returning id`,
      )
    ).rows;
    workOrderIds.push(saved!.id);
  }
  const [first, second] = workOrderIds as [string, string];
  // Saved in an order that is neither the order of the instants nor of the ids; the two Zákazky are interleaved. `ids` are what
  // the app's order falls back on where two items have the same instant: 'Rovnaká 1' has the lower one.
  const saved = [
    { order: first, name: 'Tretia', at: '2026-03-01T10:00:00Z', id: idOf(5) },
    { order: second, name: 'Iná druhá', at: '2026-02-01T10:00:00Z', id: idOf(6) },
    { order: first, name: 'Rovnaká 2', at: '2026-03-02T10:00:00Z', id: idOf(9) },
    { order: first, name: 'Prvá', at: '2026-01-01T10:00:00Z', id: idOf(8) },
    { order: second, name: 'Iná prvá', at: '2026-01-15T10:00:00Z', id: idOf(7) },
    { order: first, name: 'Rovnaká 1', at: '2026-03-02T10:00:00Z', id: idOf(2) },
    { order: first, name: 'Druhá', at: '2026-02-01T10:00:00Z', id: idOf(3) },
  ];
  for (const { order, name, at, id } of saved) {
    await db.execute(sql`
      insert into work_order_item (id, work_order_id, kind, name, quantity_hundredths, unit, unit_price_cents, vat_rate, created_at)
      values (${id}, ${order}, 'labour', ${name}, 100, 'h', 100, 23, ${at}::timestamptz)`);
  }

  await migrateDatabase(db);

  const expectedFirst = ['Prvá', 'Druhá', 'Tretia', 'Rovnaká 1', 'Rovnaká 2'];
  expect(await placed(first)).toEqual(expectedFirst);
  expect(await placed(second)).toEqual(['Iná prvá', 'Iná druhá']);

  // The numbers go on from the last one the migration gave: an item added later is last, whatever instant it is saved with.
  await db.execute(sql`
    insert into work_order_item (work_order_id, kind, name, quantity_hundredths, unit, unit_price_cents, vat_rate, created_at)
    values (${first}, 'labour', 'Pridaná po migrácii', 100, 'h', 100, 23, '2000-01-01T00:00:00Z'::timestamptz)`);
  expect(await placed(first)).toEqual([...expectedFirst, 'Pridaná po migrácii']);
});
