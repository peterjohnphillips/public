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

**Runtime, as it actually ships:** the app is a single static page (Vite +
React + TypeScript) that serves its own API in-browser
(`frontend/src/local/backend.ts`) against `localStorage` —
`frontend/src/api/client.ts` always calls that, never a network endpoint, in
both `npm run dev` and the built `index.html`. There is no server in the loop
when you use the app. No auth, no multi-tenancy, single device.

The only build-time step outside the frontend is the Markdown content parser
(`backend/app/content`), reused by `scripts/build_content.py` to produce the
JSON the frontend embeds. Nothing else runs.

## Principles

### 1. Content is data, not code

Lesson material (`content/lessons/*.md`, `content/vocab/*.md`) is plain
Markdown with YAML frontmatter, parsed by `backend/app/content/parser.py`
into the structures the app runs on. It is never edited by writing Python or
TypeScript, and `localStorage` never holds it; it only ever holds *progress
against* content (SRS scheduling, session history, streaks), never the
content itself. This means:

- Adding or editing a lesson is a Markdown edit, never a code change or a
  migration — but it is not auto-watched today. Run
  `python scripts/build_content.py` after each edit to regenerate
  `frontend/src/generated/content.json`; Vite's normal file watcher picks up
  that JSON module change like any other.
- The parser is the contract. If you change what it accepts, you are
  changing the authoring format for a person hand-writing dozens of these
  files — update `docs/content-authoring-guide.md` in the same change, and
  keep the parser's error messages naming the exact file and line, because
  silent failures here just look like missing content later.
- Unknown *values* (a category, a skill type) fail loudly and immediately.
  Unknown *structure* (a section header the parser doesn't recognize) is
  tolerated and kept as freeform notes. That asymmetry is deliberate: typos
  in fixed vocabulary are bugs; a new kind of note is just prose.

### 2. Local storage is both the durable record and the resume layer

Every piece of state has exactly one owner. With no server in the loop, both
roles live in the browser's `localStorage`, kept apart by prefix so they're
never confused:

- **`nepali:db:v1:*`** (`frontend/src/local/db.ts`): SRS scheduling, review
  history, streaks, lesson progress, session scores. This is the durable
  record — losing it means losing the whole point of spaced repetition — so
  change it with the same care you'd want for a real database: no silent
  shape drift, and a write failure should be surfaced
  (`persistence/storageHealth.ts`, shown as a header banner), not swallowed.
- **`nepali:v1:*`** (`frontend/src/persistence/`): scroll position, audio
  playback position, in-flight game answers, voice/rate settings. Losing this
  costs a scroll position, not progress, so a version bump is allowed to just
  discard it rather than migrate (see `persistence/schema.ts`).

Because `localStorage` is the *only* copy and is per-browser,
`frontend/src/persistence/backup.ts` (wired into the Progress page) exports
and imports both prefixes as one JSON file. That is the answer to "what
happens when the browser is cleared" — point people at it, don't treat it as
optional. If you add a new kind of state, decide which of the two prefixes
owns it before writing any code, not after.

### 3. Everything resumes

Closing the tab mid-passage, mid-game, or mid-lesson must never lose a
position. This is why the TTS engine writes to local storage on every
sentence boundary rather than only at the end, why in-flight game answers are
journaled per-item rather than only submitted as a batch on completion, and
why a lesson's scroll position is tracked the same way
(`persistence/lessonStore.ts`). When adding a new game mode or playback
feature, ask where its "I got interrupted here" state lives before building
the happy path.

### 4. Text-to-speech is a queue of short utterances, never one long one

`window.speechSynthesis` truncates long utterances (a well-known browser
limitation, worst on Chrome). The fix threaded through
`frontend/src/tts/`: never hand the browser more than one sentence, chain
the next utterance from the previous one's `onend`, and let the content
parser do the sentence-splitting up front so the frontend doesn't have to
re-derive it. If you touch the TTS pipeline, do not "simplify" it back into a
single `speak()` call — that reintroduces the exact bug this architecture
exists to avoid. There is no cloud TTS and no translation service by design:
content already carries Devanagari, romanization, and English side by side,
so the app reads what's there rather than translating on the fly.

### 5. One generic session/answer flow, not one per game mode

All eleven game modes submit through the same
`start` → `answer` → `finish` shape, implemented by
`frontend/src/local/backend.ts`. A mode is distinguished by what it puts
in `item_ref` (a vocab id, a sentence-pattern id, a passage span id) and
whether it sends a self-graded `quality`. This is why adding a twelfth game
mode should almost never mean adding a twelfth handler — if a new mode needs
new surface area, that's a signal to double-check whether it actually fits
the existing shape first.

### 6. Judgment calls that were made on purpose

- **A static build that serves its own API in-browser**: the frontend calls
  an in-browser copy of the API (`frontend/src/local/`) rather than a running
  server, so the whole app ships as one `index.html` with no runtime backend
  dependency, and works from `file://` or GitHub Pages as-is.
- **SM-2-lite over Leitner boxes** for spaced repetition: worth the small
  extra complexity because 900 words in three weeks needs per-item interval
  tuning, not fixed boxes.
- **Files over a CMS for content, `localStorage` over a hosted database for
  progress**: this is a single-user, single-device local tool by design.
  Reach for something heavier only if that constraint actually changes
  (multi-device sync, hosted deployment) — not by default.
- **No component library, small CSS variable set**: a personal tool doesn't
  need a design system, and a heavier one would cost more in build
  complexity than it returns in polish.

## Before making a structural change

- Changing the content Markdown format → update the parser
  (`backend/app/content/parser.py`), the sample lesson files, and
  `docs/content-authoring-guide.md` together, then re-run
  `scripts/build_content.py`.
- Adding state that must survive things → decide `db.ts` (durable) vs.
  `persistence/` (resume) first (principle 2), and if it's the latter,
  version it in `frontend/src/persistence/schema.ts`.
- Touching TTS playback → re-read principle 4 and keep the sentence queue.
- Adding a game mode → check whether it truly needs new API surface before
  adding any (principle 5); most don't.
