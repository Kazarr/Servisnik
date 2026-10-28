// Deploy tier of verify (AGENTS.md): `pnpm smoke <url> [sha]` checks that a deployed Servisník serves its
// login page and has its database, and, given a sha, that it runs that commit. Needs no dependency, so the
// deploy workflow runs it without `pnpm install`.
const paths = ['/login', '/api/health'];

/** Fetches each path without following redirects; returns one line per path that did not answer 200 (or named another commit than `sha`). */
export async function smoke(baseUrl: string, { timeoutMs = 10_000, sha }: { timeoutMs?: number; sha?: string } = {}): Promise<string[]> {
  const failures: string[] = [];
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      if (response.status !== 200) failures.push(`${path}: HTTP ${response.status}, čakalo sa 200`);
      if (response.status === 200 && sha && path === '/api/health') {
        const running = ((await response.json().catch(() => ({}))) as { sha?: string }).sha;
        if (running !== sha) failures.push(`${path}: commit ${running ?? 'nie je uvedený'}, čakalo sa ${sha}`);
      } else {
        await response.body?.cancel();
      }
    } catch (error) {
      const reason = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
      failures.push(`${path}: nedostupné (${reason})`);
    }
  }
  return failures;
}

export async function run(argv: string[]): Promise<{ exitCode: number; output: string[] }> {
  const [url, sha] = argv;
  if (!url) return { exitCode: 2, output: ['Použitie: pnpm smoke <url> [sha]'] };
  const failures = await smoke(url, { sha });
  if (failures.length > 0) return { exitCode: 1, output: ['Smoke zlyhal:', ...failures] };
  const checked = paths.map((path) => `${new URL(path, url)} 200`).join(', ');
  return { exitCode: 0, output: [`Smoke prešiel: ${checked}${sha ? ` (commit ${sha})` : ''}`] };
}

if (import.meta.main) {
  const { exitCode, output } = await run(process.argv.slice(2));
  (exitCode === 0 ? console.log : console.error)(output.join('\n'));
  process.exitCode = exitCode;
}
