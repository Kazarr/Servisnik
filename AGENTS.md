# Servisnik

Lightweight ERP for car repair shops: job orders, customers, vehicles, stock and invoices.

## Workflow

- Plans live as maps on the issue tracker. Root map: <link>. A new project starts with `/charter`; a map is worked with `/wayfinder <map>`.
- `/run` implements every ready ticket unattended; `/implement <ticket>` does one.
- After a review, a retro, or a surprise from a real system: the `lesson` skill.
- Every ~10 merged tickets: `/improve-codebase-architecture`, findings filed as tickets.
- Everything listed in `vendor.txt` is vendored. `tools/vendor.sh update` pulls new upstream versions; local changes go upstream.

## Who decides

| Question | Who |
|---|---|
| Technical, reversible, inside existing ADRs | The agent decides and notes it on the ticket |
| Ambiguous, with a safe option | The agent takes the conservative option and flags it in the ticket and the run report |
| Hard to reverse, or needs a new ADR | Human |
| Money, contract, customer-visible scope | Human |
| Business rules, or data the customer owns | Customer, through the question ledger; never invented |

## Definition of done: verify tiers

| Tier | Runs | Command | Budget |
|---|---|---|---|
| edit | after every file edit (`PostToolUse` hook) | `<fill at stack decision>` | seconds |
| ticket | before every merge | `<fill>` | under 3 min |
| batch | once per run, on the integration branch | `<fill>` | once |
| deploy | after every deploy | `<fill>` | minutes |

Business logic is unit-tested without framework, database or network. External systems are tested against their recorded real responses. End-to-end tests cover a few smoke paths and run only in the batch tier.

## Agent skills

### Issue tracker

GitHub Issues of `Kazarr/Servisnik`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, label string equal to role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
