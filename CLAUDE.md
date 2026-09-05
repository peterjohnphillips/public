# CLAUDE.md

Guidance for working in this repository, focused on the principles behind
the design rather than a restatement of the code. Read this before making
structural changes; read `docs/content-authoring-guide.md` before touching
anything under `content/`.

## What this is

A personal, single-user web app supporting a specific, intensive 3-4 week
plan to reach basic conversational Nepali. It is not a general-purpose
language-learning platform — it exists to serve one curriculum, for one
learner, and every design choice below follows from that.

Backend: FastAPI + SQLite (SQLModel). Frontend: Vite + React + TypeScript.
No auth, no multi-tenancy, runs on localhost.

## Principles

### 1. Content is data, not code

Lesson material (`content/lessons/*.md`, `content/vocab/*.md`) is plain
Markdown with YAML frontmatter, parsed by `backend/app/content/parser.py`
into the structures the app runs on. It is never edited by writing Python or
TypeScript, and the database never stores it — SQLite only holds *progress
against* content (SRS scheduling, session history, streaks), never the
content itself. This means:

- Adding or editing a lesson is a Markdown edit, hot-reloaded by the dev
  server's file watcher, never a code change or a migration.
- The parser is the contract. If you change what it accepts, you are
  changing the authoring format for a person hand-writing dozens of these
  files — update `docs/content-authoring-guide.md` in the same change, and
  keep the parser's error messages naming the exact file and line, because
  silent failures here just look like missing content later.
- Unknown *values* (a category, a skill type) fail loudly and immediately.
  Unknown *structure* (a section header the parser doesn't recognize) is
  tolerated and kept as freeform notes. That asymmetry is deliberate: typos
  in fixed vocabulary are bugs; a new kind of note is just prose.

### 2. Local storage is the resume layer, SQLite is the record

Every piece of state has exactly one owner, chosen by what happens if it's
lost:

- **SQLite**: SRS scheduling, review history, streaks, session scores. Must
  survive a cleared browser, because losing it means losing the whole point
  of spaced repetition.
- **Browser local storage**: audio playback position, in-flight game
  answers, voice/rate settings. Losing it costs a scroll position, not
  progress — so it's allowed to be per-device and ephemeral.

Nothing should be designed to require both to agree. When the backend is
unreachable, answers queue in a local outbox (`frontend/src/persistence/`)
and replay later, de-duplicated by client-generated idempotency keys — the
backend's session/answer endpoints must stay safe to call twice with the
same key. If you add a new kind of state, decide which of these two owns it
before writing any code, not after.

### 3. Everything resumes

Closing the tab mid-passage or mid-game must never lose a position. This is
why the TTS engine writes to local storage on every sentence boundary rather
than only at the end, and why in-flight game answers are journaled per-item
rather than only submitted as a batch on completion. When adding a new game
mode or playback feature, ask where its "I got interrupted here" state lives
before building the happy path.

### 4. Text-to-speech is a queue of short utterances, never one long one

`window.speechSynthesis` truncates long utterances (a well-known browser
limitation, worst on Chrome). The fix threaded through
`frontend/src/tts/`: never hand the browser more than one sentence, chain
the next utterance from the previous one's `onend`, and let the backend's
content parser do the sentence-splitting up front so the frontend doesn't
have to re-derive it. If you touch the TTS pipeline, do not "simplify" it
back into a single `speak()` call — that reintroduces the exact bug this
architecture exists to avoid. There is no cloud TTS and no translation
service by design: content already carries Devanagari, romanization, and
English side by side, so the app reads what's there rather than translating
on the fly.

### 5. One generic session/answer endpoint, not one per game mode

All eleven game modes submit through the same
`/sessions/start` → `/sessions/{id}/answer` → `/sessions/{id}/finish` flow.
A mode is distinguished by what it puts in `item_ref` (a vocab id, a
sentence-pattern id, a passage span id) and whether it sends a self-graded
`quality`. This is why adding a twelfth game mode should almost never mean
adding a twelfth backend endpoint — if a new mode needs new API surface,
that's a signal to double-check whether it actually fits the existing shape
first.

### 6. Judgment calls that were made on purpose

- **SM-2-lite over Leitner boxes** for spaced repetition: worth the small
  extra complexity because 900 words in three weeks needs per-item interval
  tuning, not fixed boxes.
- **Files over a CMS for content, SQLite over Postgres for progress**: this
  is a single-user local tool. Reach for something heavier only if that
  constraint actually changes (multi-user, hosted deployment) — not by
  default.
- **No component library, small CSS variable set**: a personal tool doesn't
  need a design system, and a heavier one would cost more in build
  complexity than it returns in polish.

## Before making a structural change

- Changing the content Markdown format → update the parser, the sample
  lesson files, `docs/content-authoring-guide.md`, and
  `backend/tests/test_content_loader.py` together.
- Adding state that must survive things → decide SQLite vs. local storage
  first (principle 2), and if it's local storage, version it in
  `frontend/src/persistence/schema.ts`.
- Touching TTS playback → re-read principle 4 and keep the sentence queue.
- Adding a game mode → check whether it truly needs new backend surface
  before adding any (principle 5); most don't.
