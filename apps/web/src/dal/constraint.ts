/** PostgreSQL refused a write because of the constraint or index called `name`; Drizzle wraps the driver's error as `cause`. */
export function violates(error: unknown, name: string) {
  return error instanceof Error && (error.cause as { constraint?: string } | undefined)?.constraint === name;
}
