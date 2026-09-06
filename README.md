# Nepali Trainer

A personal, single-user web app for an intensive 3-4 week push to basic
conversational Nepali: spaced-repetition vocabulary, a broad catalogue of
practice games, Devanagari script drills, and browser text-to-speech that can
read a full paragraph of Nepali aloud with the current sentence highlighted.

See `CLAUDE.md` for the design principles. The short version:

- **Runtime**: a single static page (Vite + React + TypeScript) that serves
  its own API in-browser (`frontend/src/local/`) against `localStorage` —
  there is no server in the loop whether you run `npm run dev`, open the
  built `index.html` from disk, or host it on GitHub Pages.
- **Content**: Markdown files in `content/`, parsed by
  `backend/app/content` (a small standalone Markdown parser, the only Python
  left in the repo) into `frontend/src/generated/content.json` at build time
  (`scripts/build_content.py`). Re-run that script after editing content; the
  frontend then picks up the change like any other file.
- **Progress**: everything lives in two `localStorage` namespaces —
  `nepali:db:v1:*` (SRS scheduling, sessions, streaks, lesson progress: the
  durable record) and `nepali:v1:*` (scroll/audio position, in-flight
  answers, settings: resume state). There is no server copy, so use
  **Progress → Export progress** before clearing site data or moving to a
  different browser or device.
- **Text-to-speech**: entirely in the browser (`window.speechSynthesis`), no
  cloud service or API key. See `frontend/src/tts/` for the queued-utterance
  approach that works around Chrome's long-utterance truncation bug.

`backend/` contains only the Markdown content parser
(`backend/app/content`) and its tests. The shipped app has no server and no
Python runtime dependency — `frontend/src/api/client.ts` always routes to the
in-browser implementation in `frontend/src/local/`.

## First-time setup

```powershell
cd frontend
npm install
cd ..

# Only needed to run scripts/build_content.py or the content-parser tests:
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
```

## Running it

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`. The app runs fully client-side — no backend
process is required.

If you've edited anything under `content/`, regenerate the embedded content
first (Vite then picks up the change automatically):

```powershell
python scripts/build_content.py
```

## Static single-file build (GitHub Pages)

```powershell
.\build-pages.ps1
```

This runs `scripts/build_content.py` →
`frontend/src/generated/content.json` and bundles the whole app into one
self-contained `index.html` at the repo root (no separate JS/CSS requests).
Commit it; GitHub Pages serves it from the branch root
(**Settings → Pages** → *Deploy from a branch* → `main` / `/ (root)`). It
behaves identically to `npm run dev` — same in-browser API, same
`localStorage` — just bundled as one file instead of served by Vite.

Caveat: progress lives in the browser it was created in — a cleared browser
loses it, and it is single-device by nature. Export a backup from the
Progress page before either.

## Writing lesson content

Lesson content is not part of this build - see
`docs/content-authoring-guide.md` for the exact Markdown format, and the four
worked examples in `content/lessons/` (day01, day04, week02, and the reading
passage). Every other file under `content/lessons/` is a stub with the
frontmatter and section headers already in place - fill those in rather than
creating new files. Remember to re-run `python scripts/build_content.py`
after editing — it is not watched automatically in the current app.

## Tests

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest
```

Covers the content parser against the real files in `content/`, so a format
change that breaks authoring shows up here rather than as an empty game
later.

There's no automated test for the frontend or for text-to-speech - TTS needs
a human ear; listen for correct sentence-by-sentence playback with no
truncation or dropped audio after touching `frontend/src/tts/`.
