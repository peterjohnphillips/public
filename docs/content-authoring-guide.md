# Content Authoring Guide

Lesson content lives entirely in `content/lessons/*.md` and `content/vocab/*.md`.
There is no database to edit and no build step to run - save the file, and the
backend's dev server picks it up automatically (it watches the `content/`
directory and reparses on change).

Four fully worked examples exist to copy from:

- `content/lessons/day01-pronunciation.md` - vocab + a short dialogue
- `content/lessons/day04-sentence-patterns.md` - sentence pattern templates
- `content/lessons/week02-conversation-cafe.md` - a longer dialogue
- `content/lessons/reading-passage-01.md` - a multi-sentence passage
- `content/lessons/script-devanagari.md` - the Devanagari character reference

Every other file in `content/lessons/` is a **stub**: frontmatter filled in,
section headers in place, `<!-- TODO -->` markers where content goes. Fill
those in directly; there's no need to create new files for the core
curriculum.

## Frontmatter

```yaml
---
id: day01-pronunciation        # must match the filename (without .md)
title: "Day 1: Pronunciation & First Greetings"
week: 1                        # 1-4
day: 1                         # 1-28, optional for week-spanning lessons
skill_type: pronunciation       # pronunciation | vocab | sentence-pattern | conversation | reading | listening
tags: [greetings, survival]     # free text, used for search/filtering only
vocab_categories: [social, people]   # subset of the 8 categories below
difficulty: 1                  # 1-4, roughly the week number
prerequisites: []               # ids of lessons that should come first (soft, not enforced)
estimated_minutes: 45
status: stub                   # stub | sample | final - set to final when you're done
---
```

The eight vocab categories, in the curriculum's priority order: `people`,
`food`, `places`, `time`, `feelings`, `verbs`, `questions`, `social`.

## Vocab block

```
## Vocab

- नमस्ते | namaste | hello / greetings | social
- धन्यवाद | dhanyabaad | thank you | social | alt: dhanyabad, dhanyawad
```

Format: `Devanagari | romanization | English | category`, with an optional
fifth field for notes. Write `alt: x, y` in the notes field to add accepted
alternate romanizations - the typing games check all of them, which matters
because Nepali romanization isn't standardised.

## Sentence Patterns block

```
## Sentence Patterns

### म ___ हुँ (Ma ___ hu — I am ___)
- म विद्यार्थी हुँ | Ma bidyarthi hu | I am a student
- म अमेरिकी हुँ | Ma amerikee hu | I am American
```

The `###` line is the template: `<devanagari with ___> (<romanized with ___>
— <english with ___>)`. Each bullet below it is one filled example in
`devanagari | romanized | english` order. Keep the blank as exactly three
underscores (`___`) - the fill-in-the-blank game derives the answer
automatically by diffing the template against each example, so no separate
authoring is needed for that game mode.

## Dialogue / Passage block

Use `## Dialogue` for a conversation between named speakers, or `## Passage`
for a reading passage with no speakers (a short story, a description).

```
## Dialogue

<!-- speaker: Sunita -->
नमस्ते! तपाईंलाई कस्तो छ?
Namaste! Tapailai kasto chha?
Hello! How are you?

<!-- speaker: Ram -->
म ठिक छु, धन्यवाद।
Ma thik chhu, dhanyabaad.
I am fine, thank you.
```

Rules:

- A `<!-- speaker: Name -->` comment starts a new turn. Omit it entirely for
  a passage with no speakers - turns are then separated by a blank line.
- Within a turn, every three consecutive non-blank lines are one unit:
  Devanagari, then romanization, then English, in that fixed order. A turn
  can stack several of these triples for a longer speech.
- A lesson may have only **one** Dialogue or Passage block, because playback
  positions are indexed against the whole lesson.
- Long lines are automatically split into sentence-level chunks for
  text-to-speech and highlighting, on `।`, `?`, `!` and `.` - you don't need
  to do anything for this beyond writing normal punctuation.
- Never nest an HTML comment inside another one (e.g. don't put a
  `<!-- speaker: X -->` marker inside a `<!-- TODO ... -->` note) - the first
  `-->` closes the outer comment early and corrupts the parse. Keep notes and
  speaker markers as separate, non-nested comments.

## Characters block (script reference only)

Only used in `content/lessons/script-devanagari.md`:

```
## Characters

- क | ka | consonant | Velar, unaspirated
- ि | i | matra | Written BEFORE the consonant but pronounced after
```

Format: `Devanagari | romanized | kind | optional notes`. `kind` is free
text (`vowel`, `consonant`, `matra`, `numeral`, `conjunct` are used in the
existing file).

## Notes block

Freeform Markdown, rendered on the lesson page but not parsed - use it for
teaching notes, pronunciation tips, or anything that doesn't fit the
structured blocks above.

## Standalone vocabulary banks

`content/vocab/bank-<category>.md` files hold vocabulary not tied to any one
lesson - useful once a word needs to be reviewable before or after the
specific lesson that happens to mention it. They use only the `## Vocab`
block, plus minimal frontmatter:

```yaml
---
id: bank-verbs
category: verbs
introduced_week: 2
---
```

## What happens when you save

The backend's dev server watches `content/` and reparses automatically. If a
file fails to parse, the error names the exact file and line - check the
terminal running `backend/run.ps1`, or hit `GET /api/content/errors`. Unknown
section headers are tolerated (kept as freeform notes); unknown category or
skill-type values are not, and will fail loudly rather than silently
dropping content.
