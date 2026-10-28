---
name: project-lessons
description: Lessons true only for Servisník (car repair shop ERP for the first autoservis): how its parallel map sessions coordinate. Use when several Servisník sessions work maps at once, or when a session negotiates a boundary with a sibling session.
---

# Servisník: lessons

- When two parallel map sessions disagree on who owns a piece of work, write the question as one line in the shared notes file and let the human decide it in one named session. From then on that line is the only source of truth, and nobody messages about it any more. Why: #52 and #55 negotiated who builds the KROS settings by messages that crossed four times, and each side's position flipped twice. Source: https://github.com/Kazarr/Servisnik/issues/52 (universal?)
- Give a `<select>` in a form that uses `useActionState` a `key` equal to the value it shows, because React updates the default of an `<input>` when it changes but not of a `<select>`, and the reset after the action puts the select back to the option it was first rendered with. Why: after a save the platiteľ DPH select showed the old option while the saved value was another, and a refusal dropped the choice; found only by e2e. Source: https://github.com/Kazarr/Servisnik/issues/121 (universal?)
- Undo a mutation check by the inverse edit, never by `git checkout -- .` or `git restore .`; or commit first. Why: the checkout also threw away the uncommitted edits of the schema and the migration journal, and the migration had to be generated again. Source: https://github.com/Kazarr/Servisnik/issues/121 (universal?)
