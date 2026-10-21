---
name: review-standards
description: Lessons a code reviewer applies on any stack: comments and docs that tell the truth, complete renames and deletions, commits that read cleanly. Use when reviewing a diff, or writing comments, docs or commit messages.
---

# Review standards: lessons

## Comments and docs tell the truth

- A comment describes the code that is in the file. Why a rejected alternative failed goes in the commit body. Source: pesitro#213.
- A docblock never claims safety that nothing verifies. It names what can fail and what guards it, including silent failures (a renamed third-party handle that just stops working). Source: pesitro#121, #202.
- A claim about framework behaviour is checked in the framework source for every caller it names. A test name claims only what its assertions check. Source: pesitro#141.
- A sentence about a delegating call states the delegate's outcome across all its branches, not the common case. Source: pesitro#213.
- A doc chapter written on the model of another is checked against the code sentence by sentence. Source: pesitro#152.
- When a test's steps or assumptions change, re-read all its comments, including those outside the diff, and drop hypotheses that are now settled. Source: pesitro#220.
- READMEs point at config files instead of repeating thresholds or lists. Source: pesitro#120.

## Complete renames, deletions and rule changes

- When a ticket deletes or renames a concept or path, grep every form: identifiers, slugs, translated and inflected words in comments and docs, escaped forms in regexes (`\/path\/`). Source: pesitro#203, #217.
- When a domain rule changes, grep its constants. When another module computes the same rule its own way, raise it, even if the plan says that module is unchanged. Source: pesitro#151.
- Before adding a constant for a value someone will supply later, grep for the value and the requirement. When a constant is already waiting for it, use that one. Source: pesitro#219.
- When a fixture's meaning changes, rename every data-provider row and docblock that describes it, and add a fixture for any branch it no longer covers. Source: pesitro#233.
- The same computation in two places becomes one function both call. Source: pesitro#96.
- A rule that applies to everything is written as one condition in code, not as a config array with a single value. Source: pesitro#97.

## Commits

- `feat` adds behaviour, `fix` changes behaviour already on main, and the scope comes from the repo's documented list. A commit that touches two packages is split by package. Source: pesitro#159, #218.
- Commit messages are in English, body included; reviewers read the branch's commit bodies. Source: pesitro#35.
