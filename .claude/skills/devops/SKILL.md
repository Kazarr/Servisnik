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

## CI and deploy

- Deploy only a tree whose exact hash passed CI. Wrap the deploy in maintenance mode, check the installed version, smoke-test HTTP 200 on key URLs, and diff the error log for new fatals. Source: pesitro `deploy.yml`.
- Budget CI from day 1: artifact retention in days, the full suite once per integration batch, and minutes tracked. Why: the artifact quota caused a 3-day CI and deploy outage, then minutes ran out. Source: pesitro#133, #224.
- Run dependency audit and secret scanning in CI. Source: pesitro verification review 2026-10-21.
- Schedule a heartbeat for background jobs (cron, queues) that alerts when the last run is too old. Source: pesitro verification review 2026-10-21.

## Unattended runs

- Before a night run, the human grants authority in chat, time-boxed and in their own words ("merge into the integration branch tonight, ask only business questions"), and the harness has matching allow rules. Why: authority written in a prompt file was refused, and a merge denial idled the queue for 5.5 h. Source: pesitro retro 2026-10-21.
- Check that auth tokens outlive the run, and run a watchdog that notifies when the run stalls. Why: an expired OAuth token left the queue dead for 2 h 40 min, and a stalled stream for about 8 h, both silently. Source: pesitro retro 2026-10-21.
- The coordinating session reads no code; children report in ten lines or fewer. Why: 102 child notifications (~70k tokens) and two compactions filled the orchestrator. Source: pesitro retro 2026-10-21.
