---
name: playwright
description: Lessons for Playwright end-to-end tests. Use when writing or fixing a Playwright spec or fixture, taking screenshots, running axe, or chasing a flaky e2e test.
---

# Playwright: lessons

## Fixtures that catch silent failures

- Give the shared `page` fixture teeth: fail the test on any console error, uncaught page exception or HTTP 5xx, and fail the run when the backend log gains a new error, warning or deprecation. Why: these caught breakage that no assertion looked at. Source: pesitro `tests/e2e/fixtures.ts`, `global-setup.ts`.
- Pages opened with `target="_blank"` escape the fixture: catch them with `page.waitForEvent('popup')` and assert inside the popup. Source: pesitro#82.
- Before reading a JSON API response, assert `response.ok()`. Why: a 4xx otherwise shows up later as `undefined` ids or wrong totals. Source: pesitro#149.
- Export helpers two specs need from the fixtures file, and grep the e2e folder before writing a login, cart or checkout block. Why: copies lose details of the original (a skeleton wait) and turn flaky. Source: pesitro#82, #149, #160.

## Waiting for the real state

- Before a full-page screenshot or an axe scan, force images to `loading = 'eager'`, wait for `complete && naturalWidth > 0`, then `decode()`. Why: lazy images below the fold stay blank, and `complete` alone fails under load. Source: pesitro#33.
- Test font loading through `document.fonts` entries with status `loaded` plus the font request URLs. Why: `document.fonts.check()` returns true for a family with no `@font-face`, so the test can never go red. Source: pesitro#68.
- Prove a deferred stylesheet (`media="print"` + `onload`) applied by asserting a property only that file sets (`toHaveCSS('position', 'fixed')`), not visibility. Source: pesitro#140.
- Retry hydration races with `expect(...).toPass()` around the action plus its check, not with sleeps. Source: pesitro `clickUntil`.
- Mark one slow test with `test.slow()` and a comment saying why; leave the global timeout alone. Why: a raised global timeout hides hangs in every other test. Source: pesitro#33.
- Read lists and counts through a retrying assertion (`toHaveText([...])`, `toHaveCount`), never `allTextContents()` or `textContent()` right after a click or navigation. Why: after a client-side navigation `allTextContents()` read the previous page and returned `[]` under load, so the batch tier went red while every ticket's own run was green. Source: Servisnik run 2026-10-26.
- Give every spec its own data, tagged per run (e.g. a random suffix on names and unique keys), and assert only the rows it created. Why: workers and `--repeat-each` share one database, so fixed names matched other runs' rows and fixed VINs collided. Source: Servisnik run 2026-10-26.

## Assertions that mean something

- Selection tests pick a value that is not the default. Why: picking the default changes nothing and passes even when the selection is never sent. Source: pesitro#103.
- Find the page heading inside `main` (`main h1`). Why: outside the homepage the site title in the header is also an `h1`. Source: pesitro#131.
- Read expected design values (colours, sizes) from the design-token source, not hard-coded hex. Source: pesitro#99.
- Emulate `forcedColors: 'active'` when information is carried only by a background (dots, bars, swatches). Source: pesitro#131.
- Responsive image tests run in both Chromium and WebKit: Chromium keeps `sizes="auto"` after `loading = 'eager'` and hides a wrong `sizes` calculation that WebKit exposes. Source: pesitro#140, #229.
