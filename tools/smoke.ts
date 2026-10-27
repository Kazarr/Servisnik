// Deploy tier of verify (AGENTS.md): `pnpm smoke <url>` checks that a deployed Servisník serves its
// login page and has its database. Needs no dependency, so the deploy workflow runs it without `pnpm install`.
const paths = ['/login', '/api/health'];

/** Fetches each path without following redirects; returns one line per path that did not answer 200. */
export async function smoke(baseUrl: string, { timeoutMs = 10_000 } = {}): Promise<string[]> {
  const failures: string[] = [];
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      await response.body?.cancel();
      if (response.status !== 200) failures.push(`${path}: HTTP ${response.status}, čakalo sa 200`);
    } catch (error) {
      const reason = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
      failures.push(`${path}: nedostupné (${reason})`);
    }
  }
  return failures;
}

export async function run(argv: string[]): Promise<{ exitCode: number; output: string[] }> {
  const [url] = argv;
  if (!url) return { exitCode: 2, output: ['Použitie: pnpm smoke <url>'] };
  const failures = await smoke(url);
  if (failures.length > 0) return { exitCode: 1, output: ['Smoke zlyhal:', ...failures] };
  const base = url.replace(/\/$/, '');
  return { exitCode: 0, output: [`Smoke prešiel: ${paths.map((path) => `${base}${path} 200`).join(', ')}`] };
}

if (import.meta.main) {
  const { exitCode, output } = await run(process.argv.slice(2));
  (exitCode === 0 ? console.log : console.error)(output.join('\n'));
  process.exitCode = exitCode;
}
