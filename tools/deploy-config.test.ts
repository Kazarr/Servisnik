import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

// Spec #77, "Nasadenie". Nothing here deploys: a cloud account, a token and a person are needed for
// that. These tests hold the files that drive a deploy to what the ticket and the research decided,
// and the image itself is proven by building and running it (README, "Nasadenie").
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

type Env = { key: string; value?: string; type?: string; scope?: string };
type Image = { registry_type: string; repository: string; tag: string };
type Spec = {
  name: string;
  region: string;
  services: { name: string; image: Image; http_port: number; health_check: { http_path: string }; envs: Env[] }[];
  jobs: { name: string; kind: string; image: Image; run_command: string; envs: Env[] }[];
  databases: { name: string; engine: string; version: string; production: boolean; cluster_name: string }[];
};
const spec = () => parse(read('.do/app.yaml')) as Spec;

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, { if?: string; environment?: string; steps: Step[] }> };
const workflow = () => parse(read('.github/workflows/deploy.yml')) as Workflow;
const steps = () => workflow().jobs.deploy!.steps;
const stepIndex = (match: (step: Step) => boolean) => {
  const index = steps().findIndex(match);
  expect(index, 'the workflow has the step').toBeGreaterThanOrEqual(0);
  return index;
};
const isSecretCheck = (step: Step) => /DIGITALOCEAN_ACCESS_TOKEN/.test(step.run ?? '') && /exit 1/.test(step.run ?? '');
const isGate = (step: Step) => (step.run ?? '').includes('tools/deploy-gate.ts');
const isBuild = (step: Step) => /docker build/.test(step.run ?? '');
const isDeploy = (step: Step) => step.uses?.startsWith('digitalocean/app_action/deploy@') ?? false;
const isSmoke = (step: Step) => /pnpm smoke/.test(step.run ?? '');
const step = (match: (step: Step) => boolean) => steps()[stepIndex(match)]!;

// What DigitalOcean fills in itself: bindable variables of a component (`${db.DATABASE_URL}`) and the app URL.
const boundByDigitalOcean = (name: string) => name.includes('.') || name === 'APP_URL';
const placeholders = (text: string) => [...text.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1]!);

test('the image is Debian-based node:24-slim and runs as a non-root user', () => {
  const dockerfile = read('Dockerfile');
  const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gim)].map((match) => match[1]);
  const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gim)].map((match) => match[1]);

  expect(new Set(bases)).toEqual(new Set(['node:24-slim']));
  expect(users.at(-1)).toBe('node');
  expect(dockerfile.lastIndexOf('USER node')).toBeLessThan(dockerfile.lastIndexOf('CMD'));
});

test('the migration tooling is a workspace install, not `pnpm deploy`, whose copy of @servisnik/domain lands in node_modules', () => {
  // Found by running the image after #79: Node refuses to strip the types of a file under node_modules,
  // so migrate.ts failed on the import of @servisnik/domain. A workspace install links the real package.
  const dockerfile = read('Dockerfile');

  expect(dockerfile).not.toMatch(/pnpm[^\n]*\bdeploy\b/);
  expect(dockerfile).toMatch(/pnpm install[^\n]*--prod/);
});

test('the app and the migration tooling belong to root: the user node can write to .next/cache only', () => {
  // A runtime user that owns the code can change the code it runs.
  const dockerfile = read('Dockerfile');

  expect(dockerfile).not.toMatch(/--chown/);
  expect([...dockerfile.matchAll(/\bchown\s+(?:-R\s+)?node(?::node)?\s+(\S+)/g)].map((match) => match[1])).toEqual(['/app/apps/web/.next/cache']);
});

// What /migrate carries is what apps/web/scripts/migrate.ts and seed.ts import, found by following their relative imports.
const importsOf = (file: string) => [...read(file).matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)].map((match) => posix.join(posix.dirname(file), match[1]!));
const reached = (files: string[], seen = new Set<string>()): Set<string> => {
  for (const file of files) if (!seen.has(file)) reached(importsOf(file), seen.add(file));
  return seen;
};
const covers = (source: string, file: string) => file === source || file.startsWith(`${source}/`);

test('/migrate holds the dependencies, the domain, the SQL migrations and the sources the scripts import, not the rest of apps/web', () => {
  const dockerfile = read('Dockerfile');
  const sources = [...dockerfile.matchAll(/^COPY --from=migrate\s+(.+)$/gm)].flatMap((match) => match[1]!.trim().split(/\s+/).slice(0, -1)).map((source) => source.replace(/^\/migrate\//, ''));
  const files = [...reached(['apps/web/scripts/migrate.ts', 'apps/web/scripts/seed.ts'])];
  // Not imported, but read by Node or the migrator: the links to the dependencies, the package.json that makes the scripts modules, the SQL files.
  const data = ['apps/web/node_modules', 'apps/web/package.json', 'apps/web/drizzle'];

  expect(files.filter((file) => !sources.some((source) => covers(source, file)))).toEqual([]);
  expect(sources.filter((source) => source.startsWith('apps/web/') && !data.includes(source) && !files.some((file) => covers(source, file)))).toEqual([]);
  expect(sources).toEqual(expect.arrayContaining(['node_modules', 'packages/domain', ...data]));
  expect(sources.filter((source) => !/^(node_modules|packages\/domain|apps\/web\/.+)$/.test(source))).toEqual([]);
});

test('the pnpm store of the migration install is pruned by tools/prune-migrate.sh, which fails when a pattern matches nothing', () => {
  expect(read('Dockerfile')).toMatch(/pnpm install[^\n]*--prod[^\n]*\\\n\s*&& sh tools\/prune-migrate\.sh node_modules\/\.pnpm\n/);
  expect(read('Dockerfile')).not.toMatch(/rm -rf/);
});

test('the Dockerfile mentions public/ only while apps/web has one: nothing copies a directory that is not there', () => {
  expect(/\bpublic\b/.test(read('Dockerfile'))).toBe(existsSync(new URL('../apps/web/public', import.meta.url)));
});

test('.dockerignore lists .env files at any depth', () => {
  const ignored = read('.dockerignore').split('\n');

  expect(ignored).toContain('**/.env*');
});

test('the App Spec has the service from the image, a managed PostgreSQL 17 cluster in Frankfurt and the health check', () => {
  const { region, services, databases } = spec();

  expect(region).toBe('fra');
  // The cluster is made by hand (README, "Nasadenie"): a managed one, not the dev database of the app.
  expect(databases).toEqual([{ name: 'db', engine: 'PG', version: '17', production: true, cluster_name: 'servisnik-test-db' }]);
  expect(services).toHaveLength(1);
  expect(services[0]!.image).toEqual({ registry_type: 'DOCR', repository: 'servisnik', tag: '${IMAGE_TAG}' });
  expect(services[0]!.health_check.http_path).toBe('/api/health');
  expect(String(services[0]!.http_port)).toBe(/^ENV .*\bPORT=(\d+)/m.exec(read('Dockerfile'))![1]);
});

const keys = ({ envs }: { envs: Env[] }) => envs.map(({ key }) => key).sort();

test('the App Spec migrates before every deploy and seeds the admin after it, both from the image of the service', () => {
  const { jobs, services } = spec();

  // The scripts run from a workspace install (/migrate, see the Dockerfile): the apps/web scripts import
  // @servisnik/domain, a TypeScript package that Node strips types from only outside node_modules.
  expect(jobs.map(({ name, kind, run_command }) => ({ name, kind, run_command }))).toEqual([
    { name: 'migrate', kind: 'PRE_DEPLOY', run_command: 'node /migrate/apps/web/scripts/migrate.ts' },
    { name: 'seed', kind: 'POST_DEPLOY', run_command: 'node /migrate/apps/web/scripts/seed.ts' },
  ]);
  for (const job of jobs) expect(job.image).toEqual(services[0]!.image);
  expect(keys(jobs[0]!)).toEqual(['DATABASE_CA_CERT', 'DATABASE_URL']);
  expect(keys(jobs[1]!)).toEqual(['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'DATABASE_CA_CERT', 'DATABASE_URL']);
});

test('the App Spec names the environment variables of spec #77 and keeps the secrets secret', () => {
  const { services, jobs } = spec();
  const secrets = ({ envs }: { envs: Env[] }) => envs.filter(({ type }) => type === 'SECRET').map(({ key }) => key).sort();

  // The admin credentials belong to the seed job only: the running service never sees them.
  expect(keys(services[0]!)).toEqual(
    [
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'DATABASE_CA_CERT',
      'DATABASE_URL',
      'KROS_API_TOKEN',
      'KROS_API_URL',
      'KROS_VAT_PAYER_TYPE',
      'KROS_WEBHOOK_SECRET',
    ].sort(),
  );
  expect(secrets(services[0]!)).toEqual(['BETTER_AUTH_SECRET', 'KROS_API_TOKEN', 'KROS_WEBHOOK_SECRET']);
  expect(secrets(jobs[1]!)).toEqual(['ADMIN_EMAIL', 'ADMIN_PASSWORD']);
});

test('what the service and the jobs share is written once in the App Spec: the image and the two database variables', () => {
  // The other tests read the spec through a YAML parser, which expands the anchors: they prove the reuse changes nothing.
  // DigitalOcean's deploy action reads it the same way (sigs.k8s.io/yaml in digitalocean/app_action, deploy/main.go).
  const text = read('.do/app.yaml');
  const written = (block: string) => text.split(block).length - 1;

  expect(written('registry_type: DOCR')).toBe(1);
  expect(written('value: ${db.DATABASE_URL}')).toBe(1);
  expect(written('value: ${db.CA_CERT}')).toBe(1);
});

test('the App Spec holds no value, only placeholders', () => {
  const { services, jobs } = spec();
  const literals = [...services, ...jobs].flatMap(({ envs }) => envs).filter(({ value }) => !value?.includes('${'));

  expect(literals).toEqual([]);
});

test('every component that connects to the database takes the URL and the CA as DigitalOcean binds them', () => {
  // The app verifies the server against `DATABASE_CA_CERT` (apps/web/test/db-tls.test.ts). The URL is
  // taken as it is: nothing is appended to it, so no sslmode of ours can fight the one in it.
  const { services, jobs } = spec();

  for (const { envs } of [...services, ...jobs]) {
    expect(envs.find(({ key }) => key === 'DATABASE_URL')!.value).toBe('${db.DATABASE_URL}');
    expect(envs.find(({ key }) => key === 'DATABASE_CA_CERT')!.value).toBe('${db.CA_CERT}');
  }
  expect(read('.do/app.yaml')).not.toMatch(/sslmode|libpq/i);
});

test('every placeholder of the App Spec that DigitalOcean does not bind is exported by the deploy step', () => {
  const needed = [...new Set(placeholders(read('.do/app.yaml')).filter((name) => !boundByDigitalOcean(name)))].sort();
  const deploy = step(isDeploy);

  expect(Object.keys(deploy.env ?? {}).sort()).toEqual(needed);
  expect(deploy.env!.IMAGE_TAG).toBe('${{ github.sha }}');
});

test('the deploy workflow runs only on workflow_dispatch', () => {
  expect(Object.keys(workflow().on)).toEqual(['workflow_dispatch']);
});

test('the deploy job runs only from main, in the environment test that holds the secrets', () => {
  // workflow_dispatch runs on any branch, and a branch can carry its own ci.yml and gate: the secrets
  // live in an environment limited to main (README) and the job refuses every other ref itself.
  const job = workflow().jobs.deploy!;

  expect(job.if).toBe("github.ref == 'refs/heads/main'");
  expect(job.environment).toBe('test');
});

test('the actions that receive the DigitalOcean token are pinned to a full commit SHA', () => {
  const receiving = steps().filter((step) => step.uses && JSON.stringify(step).includes('DIGITALOCEAN_ACCESS_TOKEN'));

  expect(receiving.map(({ uses }) => uses!.split('@')[0])).toEqual(['digitalocean/action-doctl', 'digitalocean/app_action/deploy']);
  for (const { uses } of receiving) expect(uses).toMatch(/@[0-9a-f]{40}$/);
});

test('the deploy does not print the deployment logs of a public repository', () => {
  expect(step(isDeploy).with?.print_deploy_logs).toBe(false);
});

test('the deploy workflow checks secrets, then the ticket check, then builds, deploys and runs the smoke, in that order', () => {
  const order = [isSecretCheck, isGate, isBuild, isDeploy, isSmoke].map(stepIndex);

  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(new Set(order).size).toBe(order.length);
});

test('the deploy workflow tags the image with the commit SHA and smokes the URL of the deployed app', () => {
  expect(step(isBuild).run).toContain(':$GITHUB_SHA');
  expect(Object.values(step(isSmoke).env ?? {}).join()).toContain('live_url');
});

test('the deploy workflow stops with a clear error naming each secret that is missing, before it builds', () => {
  const check = step(isSecretCheck);
  const names = Object.keys(check.env ?? {});
  // The step runs as it is, with the secrets it is given as environment variables.
  const execute = (present: string[]) => {
    const env = { ...process.env };
    for (const name of names) delete env[name];
    for (const name of present) env[name] = 'value';
    const { status, stdout, stderr } = spawnSync('bash', ['-c', check.run!], { env, encoding: 'utf8' });
    return { status, output: stdout + stderr };
  };

  expect(names).toContain('DIGITALOCEAN_ACCESS_TOKEN');
  expect(execute(names).status).toBe(0);
  for (const missing of names) {
    const refused = execute(names.filter((name) => name !== missing));
    expect(refused.status, `without ${missing}`).toBe(1);
    expect(refused.output, `without ${missing}`).toContain(missing);
    // Only the missing one is named.
    for (const other of names.filter((name) => name !== missing)) expect(refused.output).not.toContain(other);
  }
});

test('the deploy requires the secrets the skeleton needs, and KROS_* stay optional until the KROS tickets', () => {
  const check = step(isSecretCheck);
  const deploy = Object.keys(step(isDeploy).env ?? {});

  expect(Object.keys(check.env ?? {}).sort()).toEqual(['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'BETTER_AUTH_SECRET', 'DIGITALOCEAN_ACCESS_TOKEN']);
  // Every secret of the spec reaches the deploy; what the check does not require is KROS_* only.
  expect(deploy.filter((name) => name !== 'IMAGE_TAG' && !(name in (check.env ?? {}))).sort()).toEqual([
    'KROS_API_TOKEN',
    'KROS_API_URL',
    'KROS_VAT_PAYER_TYPE',
    'KROS_WEBHOOK_SECRET',
  ]);
});
