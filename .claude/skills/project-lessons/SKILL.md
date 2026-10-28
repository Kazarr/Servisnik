---
name: project-lessons
description: Lessons true only for Servisník (car repair shop ERP for the first autoservis): how its parallel map sessions coordinate, and how its Next.js app and Better Auth sessions behave. Use when several Servisník sessions work maps at once, when a session negotiates a boundary with a sibling session, or when code or a test changes a session.
---

# Servisník: lessons

- When two parallel map sessions disagree on who owns a piece of work, write the question as one line in the shared notes file and let the human decide it in one named session. From then on that line is the only source of truth, and nobody messages about it any more. Why: #52 and #55 negotiated who builds the KROS settings by messages that crossed four times, and each side's position flipped twice. Source: https://github.com/Kazarr/Servisnik/issues/52 (universal?)
- End a Server Action that changes the session (a new password with `revokeOtherSessions`, which swaps the session) with `redirect()` to the page, not with returned state. Why: Next.js renders the page the action came from with the request's old cookie, which no longer names a session, so the user landed on the login page; a redirect loads the page with the new cookie, as after the login. Source: https://github.com/Kazarr/Servisnik/issues/120 (universal?)
- In a test of Better Auth, copy the cookie it sends at once after the call under test, before any further request. Why: a request with an ended session makes Better Auth send a cookie that clears it, which overwrote the replacement session's cookie and made a correct change look like a lost sign-in. Source: https://github.com/Kazarr/Servisnik/issues/120 (universal?)
