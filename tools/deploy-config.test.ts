import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  databases: { name: string; engine: string; version: string }[];
};
const spec = () => parse(read('.do/app.yaml')) as Spec;

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, string> };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, { steps: Step[] }> };
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

test('the build context never carries .env files into the image', () => {
  const ignored = read('.dockerignore').split('\n');

  expect(ignored).toContain('.env*');
});

test('the App Spec has the service from the image, PostgreSQL 17 in Frankfurt and the health check', () => {
  const { region, services, databases } = spec();

  expect(region).toBe('fra');
  expect(databases.map(({ engine, version }) => ({ engine, version }))).toEqual([{ engine: 'PG', version: '17' }]);
  expect(services).toHaveLength(1);
  expect(services[0]!.image).toEqual({ registry_type: 'DOCR', repository: 'servisnik', tag: '${IMAGE_TAG}' });
  expect(services[0]!.health_check.http_path).toBe('/api/health');
  expect(String(services[0]!.http_port)).toBe(/^ENV .*\bPORT=(\d+)/m.exec(read('Dockerfile'))![1]);
});

test('the App Spec runs the migration as a pre-deploy job from the same image', () => {
  const { jobs, services } = spec();

  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ kind: 'PRE_DEPLOY', image: services[0]!.image, run_command: 'node /migrate/scripts/migrate.ts' });
  expect(jobs[0]!.envs.map(({ key }) => key)).toEqual(['DATABASE_URL']);
});

test('the App Spec names the environment variables of spec #77 and keeps the secrets secret', () => {
  const envs = spec().services[0]!.envs;

  expect(envs.map(({ key }) => key).sort()).toEqual(
    [
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'DATABASE_URL',
      'KROS_API_TOKEN',
      'KROS_API_URL',
      'KROS_VAT_PAYER_TYPE',
      'KROS_WEBHOOK_SECRET',
    ].sort(),
  );
  expect(envs.filter(({ type }) => type === 'SECRET').map(({ key }) => key).sort()).toEqual(
    ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'BETTER_AUTH_SECRET', 'KROS_API_TOKEN', 'KROS_WEBHOOK_SECRET'].sort(),
  );
});

test('the App Spec holds no value, only placeholders', () => {
  const { services, jobs } = spec();
  const literals = [...services, ...jobs].flatMap(({ envs }) => envs).filter(({ value }) => !value?.includes('${'));

  expect(literals).toEqual([]);
});

test('the App Spec connects to DigitalOcean PostgreSQL with libpq-style TLS, because pg cannot verify its CA', () => {
  // DigitalOcean signs its databases with its own CA, which Node does not trust: with the URL as given
  // (`sslmode=require`) pg verifies the chain and the connection fails. `uselibpqcompat` makes
  // `require` mean what libpq means, an encrypted connection without chain verification.
  const { services, jobs } = spec();

  for (const { envs } of [services[0]!, jobs[0]!]) {
    expect(envs.find(({ key }) => key === 'DATABASE_URL')!.value).toBe('${db.DATABASE_URL}&uselibpqcompat=true');
  }
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

test('the secrets the deploy workflow checks are the ones it passes to the deploy', () => {
  const check = step(isSecretCheck);
  const deploy = step(isDeploy);
  const secrets = Object.keys(deploy.env ?? {}).filter((name) => name !== 'IMAGE_TAG');

  expect(Object.keys(check.env ?? {}).sort()).toEqual(['DIGITALOCEAN_ACCESS_TOKEN', ...secrets].sort());
});
