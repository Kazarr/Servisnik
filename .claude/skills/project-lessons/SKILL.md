---
name: project-lessons
description: Lessons true only for Servisník (car repair shop ERP for the first autoservis): how its parallel map sessions coordinate. Use when several Servisník sessions work maps at once, or when a session negotiates a boundary with a sibling session.
---

# Servisník: lessons

- When two parallel map sessions disagree on who owns a piece of work, write the question as one line in the shared notes file and let the human decide it in one named session. From then on that line is the only source of truth, and nobody messages about it any more. Why: #52 and #55 negotiated who builds the KROS settings by messages that crossed four times, and each side's position flipped twice. Source: https://github.com/Kazarr/Servisnik/issues/52 (universal?)
- When two parallel tickets each generate a Drizzle migration, the second to merge gets the same number and conflicts on `drizzle/meta/_journal.json` and the snapshot. Take the incoming journal and snapshot, delete your SQL file, run `pnpm db:generate --name <name>` again so it is numbered after theirs, and put back any SQL you wrote by hand (such as a starting row). Why: #119 and the customer search both made `0004`, and keeping both files would have applied them in the wrong order. Source: https://github.com/Kazarr/Servisnik/issues/119 (universal?)
