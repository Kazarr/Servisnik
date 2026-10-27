/** Runs once when the server starts. Node-only code lives in its own file so that the Edge build never sees it. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return; // `next build` needs no secrets
  const { checkEnv } = await import('./instrumentation-node.ts');
  checkEnv();
}
