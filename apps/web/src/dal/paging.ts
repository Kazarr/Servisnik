import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/** The rows of a page of a list with a search: Zákazníci and Vozidlá alike. */
export const pageSize = 25;

/** Whether `column` holds `part`. `strpos` takes it as plain text, so a `%` or an `_` in it is no wildcard; a column that is null holds nothing. */
export const contains = (column: AnyPgColumn, part: string) => sql`strpos(${column}, ${part}) > 0`;

/**
 * The page of a list of `total` rows that `page` asks for: any page past the last is the last, and
 * anything that is not a page number is the first. `limit` and `offset` select its rows.
 */
export function pageWindow(total: number, page: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Number.isInteger(page) ? Math.min(Math.max(page, 1), pageCount) : 1;
  return { page: current, pageCount, limit: pageSize, offset: (current - 1) * pageSize };
}
