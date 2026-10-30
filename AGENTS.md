# Servisnik

Lightweight ERP for car repair shops: job orders, customers, vehicles, stock and invoices.

## Workflow

- Plans live as maps on the issue tracker. Root map: [Mapa: Servisník](https://github.com/Kazarr/Servisnik/issues/42). A new project starts with `/charter`; a map is worked with `/wayfinder <map>`.
- `/run` implements every ready ticket unattended; `/implement <ticket>` does one. A `PreToolUse` hook (`tools/cpu-gate.ts`) starts an `implementer` only while the CPU is under 80 %, so a run never starts more than the machine carries.
- Merge every PR with a merge commit as soon as it is mergeable and its required checks are green, without waiting for a human review: run `gh pr merge --auto --merge --delete-branch` right after `gh pr create`. The required check is the ticket tier in CI. This overrides the `run` skill's "the human merges".
- After a review, a retro, a surprise from a real system, or anything that failed (a command, a tool call, a wrong assumption): fix it, then record it with the `lesson` skill so it does not recur.
- Every ~10 merged tickets: `/improve-codebase-architecture`, findings filed as tickets. It also lists code that uses no `GLOSSARY.md` term as a candidate for its own package.
- Everything listed in `vendor.txt` is vendored. `tools/vendor.sh update` pulls new upstream versions; local changes go upstream.

## Who decides

| Question | Who |
|---|---|
| Technical, reversible, inside existing ADRs | The agent decides and notes it on the ticket |
| Ambiguous, with a safe option | The agent takes the conservative option and flags it in the ticket and the run report |
| Hard to reverse, or needs a new ADR | Human |
| Money, contract, customer-visible scope | Human |
| Business rules, or data the customer owns | Customer, through the question ledger; never invented |

Sort every question by this table before asking it, grilling rounds included: put only the Human rows to the human, file the Customer rows in the ledger, decide the rest and note it. Why: a grilling round put 13 mostly technical questions to the human, and the human pushed back. Source: https://github.com/Kazarr/Servisnik/issues/55.

## Definition of done: verify tiers

| Tier | Runs | Command | Budget |
|---|---|---|---|
| edit | after every file edit (`PostToolUse` hook) | `pnpm typecheck` | seconds |
| ticket | before every merge, as the required CI check `ticket` | `pnpm verify`: typecheck, commit check, tests | under 3 min |
| batch | once per run, on the integration branch | `pnpm e2e` (Playwright, added by the walking skeleton) | once |
| deploy | after every deploy | `pnpm smoke <url>` (added by the walking skeleton) | minutes |

The commit check of the ticket tier (`packages/check-commits`) fails a `feat` or `fix` commit that changes test files (the `TEST_FILE` pattern in `packages/check-commits/src/index.ts`), a `test` commit that changes any file the pattern does not match (a config file or a production file, one that is only moved included, because a rename reads as delete + add), a `feat` with no `test` commit since the previous `feat` on its own line of commits (first parents), a commit of any type that changes files of two workspace packages (`packages/<x>/`, `apps/<y>/`; files outside them, in the root, `docs/` and `tools/`, count for none, and a file moved between packages counts for both), and a `fix` whose changed files were all added by earlier commits of its own line: that is a `feat` of the same ticket, because a `fix` changes behaviour already on the base (it judges files, not lines; the header of `packages/check-commits/src/index.ts` says why); merge commits and the full SHAs in `packages/check-commits/allowlist.txt` (merged commits that predate the rule they break, one reason each) are skipped. It reads only the commits in `$CHECK_COMMITS_BASE..HEAD`: in CI the base of the PR, locally `origin/main` unless you set the variable (on a ticket branch cut from an integration branch, set it to that branch).

Business logic is unit-tested without framework, database or network. External systems are tested against their recorded real responses. End-to-end tests cover a few smoke paths and run only in the batch tier.

## Code layout

Stack and architecture: `docs/adr/0001-stack.md`. `packages/domain` holds Servisník's rules, one folder per glossary area; areas call each other only through the area's `index.ts`, and the package has no runtime dependencies. Code that needs no `GLOSSARY.md` term goes into its own package, like `packages/kros`; small helpers only `packages/domain` uses (dates, number parsers) stay in the domain, so it keeps no dependencies.

## Agent skills

### Issue tracker

GitHub Issues of `Kazarr/Servisnik`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, label string equal to role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
