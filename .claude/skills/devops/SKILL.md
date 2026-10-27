---
name: devops
description: Lessons for environments, CI, deploys and unattended agent runs. Use when setting up dev environments or CI, deploying, configuring staging or production, or preparing an unattended run.
---

# DevOps: lessons

## Environments

- Commit the environment and access doc (hosts, how to reach them, which credentials exist where) and every helper script on day 1. Why: orchestrator scripts kept in `/tmp` and a 127 KB spec in a session scratchpad were lost or found only by chance. Source: pesitro retro 2026-10-21.
- Give every parallel worktree its own environment (port = base + ticket number) and keep heavy shared environments out of the ticket tier. Why: one shared environment slot queued tickets for 7–16 h while implementing took 50–90 min. Source: pesitro#236, retro 2026-10-21.
- Keep one copy of the repo per purpose; delete stale clones. Why: a stale Windows clone misled 12 sessions. Source: pesitro retro 2026-10-21.
- Set agents up with key-based SSH to staging before the first deploy. Why: password prompts across 10+ terminal tabs blocked every staging step. Source: pesitro retro 2026-10-21.
- Keep staging and production configuration as idempotent scripts or migrations, not runbook clicks. Why: manual config drifted from the seed, and a staging script rewrote page content. Source: pesitro verification review 2026-10-21.
- Pull MinIO as `cgr.dev/chainguard/minio:latest`. Why: MinIO stopped publishing community images; `minio/minio` no longer exists on Docker Hub and quay.io returns 401. Source: Servisnik#60.
- Start an optional Compose service with `docker compose --profile <p> up <service>` and stop it with `docker compose --profile <p> down`, never with `compose run`. Why: `down`, even with `--remove-orphans`, leaves `run` containers and services of inactive profiles running, and a tunnel outlived `down`. Source: Servisnik#60.
- When npm or pnpm fails TLS (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `UnknownIssuer`), read the issuer first with `openssl s_client -connect registry.npmjs.org:443`. A TLS-inspecting firewall's CA goes into `NODE_EXTRA_CA_CERTS`; without that CA, pnpm installs through `registry.yarnpkg.com` in two steps: `--lockfile-only`, strip the lockfile's `tarball:` URLs, then `--frozen-lockfile`, each with `--registry`. Why: a FortiGate intercepted only registry.npmjs.org, `--use-system-ca` failed because Windows did not trust its CA either, and a one-step mirror install failed because the mirror's metadata keeps npmjs tarball URLs. Source: Servisnik#44.

## CI and deploy

- Deploy only a tree whose exact hash passed CI. Wrap the deploy in maintenance mode, check the installed version, smoke-test HTTP 200 on key URLs, and diff the error log for new fatals. Source: pesitro `deploy.yml`.
- Budget CI from day 1: artifact retention in days, the full suite once per integration batch, and minutes tracked. Why: the artifact quota caused a 3-day CI and deploy outage, then minutes ran out. Source: pesitro#133, #224.
- Run dependency audit and secret scanning in CI. Source: pesitro verification review 2026-10-21.
- Schedule a heartbeat for background jobs (cron, queues) that alerts when the last run is too old. Source: pesitro verification review 2026-10-21.
- Wire the edit tier as a script that runs only for source files inside the repo and exits 2 with the install command when its tool is missing, and pipe-test it with payloads built by `JSON.stringify`. Why: a bare `pnpm typecheck` hook fired on every Edit in the session, including files of another repo, and blocked each one with "pnpm: command not found" on a machine without pnpm. Source: Servisnik#85.
- Give every setup step in the README a root script and have CI run that same script. Why: in a pnpm workspace the README's `pnpm exec playwright install chromium` failed from the repo root because the bin lives only in `apps/web`, and nothing ever ran the README as written. Source: Servisnik#78.
- Give the database client a connect timeout shorter than the platform's health-check timeout, and test the health route against an unroutable host, not only a refused port. Why: `pg.Pool` has no connect timeout by default, so `/api/health` hung instead of returning 503 when the host dropped packets. Source: Servisnik#78.
- Run deploy jobs only from the default branch, through a GitHub Environment restricted to it that holds the deploy secrets. Why: a `workflow_dispatch` deploy ran on any ref, repo-level secrets were readable by every branch's CI in a public repo, and a branch could carry its own copy of the CI gate. Source: Servisnik#83.
- Verify a managed database's TLS chain with the CA the provider binds (DigitalOcean `${db.CA_CERT}`) instead of turning verification off. Why: the first deploy spec used `uselibpqcompat=true`, which keeps TLS but trusts any certificate. Source: Servisnik#83.
- In an image that runs TypeScript with Node's type stripping, install the filtered workspace (`pnpm install --prod --filter "<app>..."`) instead of `pnpm deploy`, and re-run the image's scripts after every new workspace dependency. Why: `pnpm deploy` copied `@servisnik/domain` into `node_modules`, where Node refuses to strip types, so migrate and seed in the image failed while the app itself still started. Source: Servisnik#83.

## Unattended runs

- Before a night run, the human grants authority in chat, time-boxed and in their own words ("merge into the integration branch tonight, ask only business questions"), and the harness has matching allow rules. Why: authority written in a prompt file was refused, and a merge denial idled the queue for 5.5 h. Source: pesitro retro 2026-10-21.
- Issue each allow-listed external write (`gh issue close`, `gh pr merge`) as its own bare Bash call, with no pipe, `&&`, `;` or redirection. Why: a 504 hit the second close in an `&&` chain after the first had applied. The piped retry was then denied by auto mode as "External System Writes" although `Bash(gh issue close *)` was allowed, and the bare call passed. Source: Servisnik#29.
- Before a ticket where the agent opens a public tunnel (cloudflared, ngrok), the human adds a Bash allow rule for that exact command. Why: Claude Code auto mode denies it as "External Ingress Tunnel", and a yes in chat covered one run only. Source: Servisnik#60.
- Check that auth tokens outlive the run, and run a watchdog that notifies when the run stalls. Why: an expired OAuth token left the queue dead for 2 h 40 min, and a stalled stream for about 8 h, both silently. Source: pesitro retro 2026-10-21.
- The coordinating session reads no code; children report in ten lines or fewer. Why: 102 child notifications (~70k tokens) and two compactions filled the orchestrator. Source: pesitro retro 2026-10-21.
- Stamp every run-ledger line from the clock (`date '+%Y-%m-%d %H:%M'` in the same command that appends it), never type the time. Why: hand-typed times ran 75 minutes ahead of the clock, so the stall watchdog that reads the last line would have taken a dead run for a fresh one. Source: Servisnik run 2026-10-26.
- When a ticket branch must be rewritten, push the result under a new branch name and merge that one; never plan on a force-push. Why: auto mode denied the force-push of a rewritten ticket branch, and the coordinator must not repeat a denied action for the implementer. Source: Servisnik#83.
