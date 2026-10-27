import { appEnv } from './env.ts';
import { printError } from './print-error.ts';

/** A missing variable stops the app with a message that names it. */
export function checkEnv() {
  try {
    appEnv();
  } catch (error) {
    // Next only logs a register() that throws and keeps serving, so the exit is ours.
    printError(error);
    process.exit(1);
  }
}
