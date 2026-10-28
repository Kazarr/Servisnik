/** PostgreSQL refused a write because of the constraint or index called `name`; Drizzle wraps the driver's error as `cause`. */
export function violates(error: unknown, name: string) {
  return error instanceof Error && (error.cause as { constraint?: string } | undefined)?.constraint === name;
}

/**
 * PostgreSQL refused a delete because a row still points at the record: a foreign key, whichever table
 * it is on, so a table added later is covered too. Every key to a Zákazník or a Vozidlo is `restrict`
 * (test/deletion.test.ts checks that), and `restrict` looks at the rows as they are when the delete
 * runs, so a link added a moment earlier is seen.
 */
export function blockedByLink(error: unknown) {
  return error instanceof Error && (error.cause as { code?: string } | undefined)?.code === '23503';
}
