import { appEnv } from './env.ts';

/** Runs once when the server starts: a missing variable stops the app with a clear message. */
export function register() {
  if (process.env.NEXT_PHASE !== 'phase-production-build') appEnv(); // `next build` needs no secrets
}
