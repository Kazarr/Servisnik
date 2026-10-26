import { stripVTControlCharacters } from 'node:util';

/**
 * The lines of the app's stderr that fail the run (global-setup.ts checks them at the end).
 * Better Auth warns on every wrong password, and login.spec.ts types one on purpose.
 */
export function unexpectedStderr(stderr: string): string[] {
  return stripVTControlCharacters(stderr)
    .split('\n')
    .filter((line) => line && !line.includes('[Better Auth]: Invalid password'));
}
