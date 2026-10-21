---
name: testing-strategy
description: Lessons for test strategy and TDD discipline on any stack. Use when planning tests for a ticket, writing a red test, deciding which tier a test belongs to, or judging whether a green test proves anything.
---

# Testing strategy: lessons

## Tiers and speed

- Put each test in the cheapest tier that can catch its bug: logic in unit tests, external systems in contract tests against recorded responses, end-to-end only for a few smoke paths in the batch tier. Why: a full verify of 18–20 min, run 3–5× per ticket, was the main cost of every ticket. Source: pesitro retro 2026-10-21.
- Build contract fixtures from recorded real responses, never from the API docs alone. Why: swagger-derived fixtures passed while the live ERP prefixed columns, returned zero prices and rejected a field; every mismatch surfaced only after merge. Source: pesitro#179, #231–#234.
- Run the batch tier on a fresh database. Why: e2e state leaked between tests on the dev database, so local green met CI red. Source: pesitro#216.
- When verify fails only on timeouts in tests outside the ticket (a different set each run), re-run just the failed specs once; when they pass, report it and let CI decide. Why: two hours went into five full verify runs chasing load timeouts after a 15-minute fix. Source: pesitro#183.
- Prove a flaky fix with `--repeat-each=5` (or the runner's equivalent) before calling it fixed. Source: pesitro#141.

## Red: the test must fail for the right reason

- A red test fails on its assertion about the missing behaviour. Failing on an unrelated error (HTTP 500, fatal, timeout) proves nothing; stop and find out why. Planned-but-missing interface counts as missing behaviour: class not found, undefined method, wrong argument count. Source: pesitro#55, #150, #154, #157.
- A test that is green the moment it is written gets a mutation check: break the line it guards, watch it fail, restore, and report the mutation. Data-provider rows expecting `false` need this most, because a renamed key keeps them green for the wrong reason. Source: pesitro#152, #179.
- Every rule and invariant in the plan has a test that fails when the rule is mutated. Before reporting done, walk the plan's rules one by one and name each one's test. Source: pesitro#150, #155.
- A deviation from the plan, even a more cautious one, gets its own test. Source: pesitro#155.

## Green: implement only what the current test demands

- The first `feat:` commit carries only the behaviour the current red test asks for. Extra values, branches and guards arrive with the tests that demand them, and a helper ported from deleted code arrives with the test that ports it. Why: pre-built branches made later tests green on arrival, five times over. Source: pesitro#35, #157, #158, #205, #218.
- Keep `test:` commits pure, and amend a test only while it is still red. A test changed during implementation (a weakened assert, a fixed setup) goes in a new `test:` commit before the `feat:`. Why: an amend hid that `assertCount(1)` had been weakened to `assertNotEmpty`. Source: pesitro#131, #154.

## Shapes that slip through

- An ordering rule ("check A, then B") gets a test whose input satisfies both conditions at once. Source: pesitro#159.
- When a plan lists what a branch must *not* do (no write, no note, no email, no log), assert every item, and include a row for the last retry attempt. Source: pesitro#204.
- Code that reads "all records" gets a test with more records than the framework's default page size. Source: pesitro#157.
- A "no configuration changes nothing" test compares the whole captured state with strict equality, never a subset match. Source: pesitro#189.
- A test that bypasses the real path (order via API instead of checkout) claims only what it covers; the real path's totals are asserted in its own test. Why: the API path rounded VAT to 0.66, checkout to 0.65. Source: pesitro#149.
- A rule that lives in a template or view is tested by rendering it over temporary data, not by calling the helper it uses. Source: pesitro#228.
- A refactor that deletes tests maps every deleted assertion to a surviving or new one. Source: pesitro#157.
- A test that reports state involving a secret prints only whether it matched (`password: matches`), never the value. Source: pesitro#189.

## Checks are code too

- Every custom check (lint script, budget, boundary rule) has its own test with one example that passes and one that fails, asserting the exact violation list. Its CLI wrapper is only the line that reads argv; everything else is exported and tested. Why: a silently broken check is a false green, and an autonomous run trusts green. Source: pesitro#97, #224.
