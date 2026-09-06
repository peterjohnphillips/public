# Nepali Trainer

A personal, single-user web app for an intensive 3-4 week push to basic
conversational Nepali: spaced-repetition vocabulary, a broad catalogue of
practice games, Devanagari script drills, and browser text-to-speech that can
read a full paragraph of Nepali aloud with the current sentence highlighted.

See `.claude/plans/target-3-4-weeks-joyful-goblet.md` (or wherever this
session's plan file landed) for the full design. The short version:

- **Backend**: FastAPI + SQLite (via SQLModel). Lesson content lives as plain
  Markdown files in `content/`, not in the database - the database only holds
  scheduling state, session history, and progress.
- **Frontend**: Vite + React + TypeScript. Everything the user does is
  mirrored into browser local storage as it happens, so closing a tab
  mid-passage or mid-game loses nothing.
- **Text-to-speech**: entirely in the browser (`window.speechSynthesis`), no
  cloud service or API key. See `frontend/src/tts/` for the queued-utterance
  approach that works around Chrome's long-utterance truncation bug.

## First-time setup

```powershell
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt

cd frontend
npm install
cd ..
```

## Running it

```powershell
.\run-all.ps1
```

This opens two windows: the backend on `http://localhost:8000` and the
frontend on `http://localhost:5173`. Open the frontend URL - the Vite dev
server proxies `/api` to the backend, so there's nothing else to configure.

Or run them individually:

```powershell
.\backend\run.ps1    # http://localhost:8000, auto-reloads on code AND content changes
.\frontend\run.ps1   # http://localhost:5173
```

## Static single-file build (GitHub Pages)

The full-stack app above needs Python. There is also a **zero-backend build**:
one self-contained `index.html` at the repo root that runs entirely in the
browser, with the FastAPI surface reimplemented in-process
(`frontend/src/local/`) against `localStorage`, and the parsed content baked
in at build time.

```powershell
.\build-pages.ps1
```

That runs the real content parser (`scripts/build_content.py` →
`frontend/src/generated/content.json`) and bundles everything into a single
`index.html`. Commit it; GitHub Pages serves it from the branch root
(**Settings → Pages** → *Deploy from a branch* → `main` / `/ (root)`).

Caveats of the static build: progress lives in the browser it was created in
(a cleared browser loses it — there is no server to be the durable record),
and it is single-device. The local full-stack setup is unchanged.

## Writing lesson content

Lesson content is not part of this build - see
`docs/content-authoring-guide.md` for the exact Markdown format, and the four
worked examples in `content/lessons/` (day01, day04, week02, and the reading
passage). Every other file under `content/lessons/` is a stub with the
frontmatter and section headers already in place - fill those in rather than
creating new files.

## Tests

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest
```

Covers the content parser (against the real files in `content/`), the SM-2
scheduling algorithm's edge cases, and the API end to end (session lifecycle,
SRS application, idempotent answer/session replay, progress stats).

There's no automated test for text-to-speech - that needs a human ear. See
the verification section of the plan file for what to listen for.
