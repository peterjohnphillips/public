"""Parse a lesson markdown file into structured content.

Format reference: docs/content-authoring-guide.md

The parser is forgiving about structure it does not recognise (unknown sections
are captured as notes and rendered as-is) but strict about values it does
recognise (an unknown category or skill type fails loudly with file and line),
because the author is hand-writing dozens of these and a silent skip would hide
a typo until a game mode mysteriously had no items.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

from app.models.schemas import (
    CharacterItem,
    ContentStatus,
    Lesson,
    PlaybackUnit,
    SentenceExample,
    SentencePattern,
    SkillType,
    Span,
    VocabCategory,
    VocabItem,
)

logger = logging.getLogger(__name__)

BLANK_MARKER = "___"

# Sentence-ending punctuation: Devanagari danda plus western marks.
_SENTENCE_SPLIT_RE = re.compile(r"[^।?!.]+[।?!.]*")
_SPEAKER_RE = re.compile(r"^<!--\s*speaker\s*:\s*(.+?)\s*-->$", re.IGNORECASE)
_COMMENT_RE = re.compile(r"^<!--.*-->$")
_HEADING2_RE = re.compile(r"^##\s+(.*\S)\s*$")
_HEADING3_RE = re.compile(r"^###\s+(.*\S)\s*$")
_BULLET_RE = re.compile(r"^[-*]\s+(.*\S)\s*$")
# "template_dev (template_rom — template_eng)"
_PATTERN_HEAD_RE = re.compile(r"^(?P<dev>.+?)\s*\((?P<rest>.+)\)\s*$")
_PATTERN_SEP_RE = re.compile(r"\s+[—–]\s+|\s+-\s+")
_ALT_ROMAN_RE = re.compile(r"\balt\s*:\s*([^;]+)", re.IGNORECASE)
_SLUG_STRIP_RE = re.compile(r"[\s।?!.,;:'\"()\[\]]+")


class ContentError(Exception):
    """A content file could not be parsed. Always names the file, and the line
    when the problem is line-scoped."""

    def __init__(self, message: str, path: Path | str, line: int | None = None) -> None:
        location = f"{path}:{line}" if line is not None else str(path)
        super().__init__(f"{location}: {message}")
        self.path = str(path)
        self.line = line
        self.reason = message


@dataclass
class _Section:
    kind: str  # vocab | patterns | dialogue | passage | notes
    heading: str
    lines: list[tuple[int, str]] = field(default_factory=list)


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Collapse whitespace and punctuation to hyphens.

    Devanagari characters are preserved rather than transliterated, because the
    Devanagari form is the stable identity of a word: romanization gets edited
    as the author refines it, and an id that shifts would orphan SRS history.
    """
    return _SLUG_STRIP_RE.sub("-", text.strip()).strip("-").lower()


def make_vocab_id(devanagari: str, category: str) -> str:
    return f"{slugify(devanagari)}-{category}"


def split_sentences(text: str) -> list[str]:
    """Split a line into sentences, keeping terminal punctuation."""
    parts = [p.strip() for p in _SENTENCE_SPLIT_RE.findall(text)]
    return [p for p in parts if p]


def _classify_heading(heading: str) -> str:
    normalised = heading.strip().lower()
    # Checked before "reading" so a "## Characters" block in the script lesson
    # is not swallowed by the passage rule.
    if "character" in normalised or "alphabet" in normalised or "script" in normalised:
        return "characters"
    if "vocab" in normalised:
        return "vocab"
    if "pattern" in normalised:
        return "patterns"
    if "dialogue" in normalised or "dialog" in normalised:
        return "dialogue"
    if "passage" in normalised or "reading" in normalised or "story" in normalised:
        return "passage"
    return "notes"


def _is_ignorable(line: str) -> bool:
    stripped = line.strip()
    return not stripped or bool(_COMMENT_RE.match(stripped))


def _parse_alt_romanizations(notes: str | None) -> list[str]:
    """Pull `alt: foo, bar` out of a vocab item's notes field.

    These become additional accepted answers in the typing drills, which matters
    because Nepali romanization is not standardised.
    """
    if not notes:
        return []
    match = _ALT_ROMAN_RE.search(notes)
    if not match:
        return []
    return [alt.strip() for alt in match.group(1).split(",") if alt.strip()]


# --------------------------------------------------------------------------
# Section splitting
# --------------------------------------------------------------------------

def _body_lines(raw_text: str) -> list[tuple[int, str]]:
    """Body lines paired with their real line number in the file.

    Taken from the raw text rather than the frontmatter library's stripped
    content, because that strips leading blank lines and every reported line
    number would then be off by however many the author happened to leave.
    """
    lines = raw_text.splitlines()
    start = 0
    if lines and lines[0].strip() == "---":
        for index in range(1, len(lines)):
            if lines[index].strip() in {"---", "..."}:
                start = index + 1
                break
    return [(start + offset + 1, line) for offset, line in enumerate(lines[start:])]


def _strip_comments(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Blank out HTML comments, including multi-line ones.

    Stub files wrap their TODO examples in multi-line comments, and an author
    commenting out a draft turn is routine, so those lines must not be read as
    content. Speaker markers are themselves comments and are preserved. Lines
    are blanked rather than removed so line numbers stay accurate.
    """
    result: list[tuple[int, str]] = []
    in_comment = False
    for line_no, line in lines:
        stripped = line.strip()
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            result.append((line_no, ""))
            continue
        if _SPEAKER_RE.match(stripped):
            result.append((line_no, line))
            continue
        if "<!--" in stripped:
            if "-->" not in stripped.split("<!--", 1)[1]:
                in_comment = True
            result.append((line_no, ""))
            continue
        result.append((line_no, line))
    return result


def _split_sections(lines: list[tuple[int, str]]) -> list[_Section]:
    sections: list[_Section] = []
    current = _Section(kind="notes", heading="")
    for line_no, raw_line in lines:
        heading_match = _HEADING2_RE.match(raw_line)
        if heading_match:
            if current.lines or current.heading:
                sections.append(current)
            heading = heading_match.group(1)
            current = _Section(kind=_classify_heading(heading), heading=heading)
            continue
        current.lines.append((line_no, raw_line))
    if current.lines or current.heading:
        sections.append(current)
    return sections


# --------------------------------------------------------------------------
# Block parsers
# --------------------------------------------------------------------------

def _parse_vocab_section(
    section: _Section,
    path: Path,
    *,
    lesson_id: str | None,
    introduced_week: int | None,
) -> list[VocabItem]:
    items: list[VocabItem] = []
    seen: set[str] = set()
    for line_no, raw_line in section.lines:
        if _is_ignorable(raw_line):
            continue
        bullet = _BULLET_RE.match(raw_line.strip())
        if not bullet:
            # Prose inside a vocab block is tolerated (authors leave reminders).
            continue
        fields = [f.strip() for f in bullet.group(1).split("|")]
        if len(fields) < 4:
            raise ContentError(
                "vocab line needs at least 4 fields "
                "'devanagari | romanized | english | category', got "
                f"{len(fields)}: {bullet.group(1)!r}",
                path,
                line_no,
            )
        devanagari, romanized, english, category_raw = fields[:4]
        notes = fields[4] if len(fields) > 4 else None
        if not devanagari or not romanized or not english:
            raise ContentError(
                "vocab line has an empty devanagari, romanized or english field",
                path,
                line_no,
            )
        try:
            category = VocabCategory(category_raw.strip().lower())
        except ValueError:
            valid = ", ".join(c.value for c in VocabCategory)
            raise ContentError(
                f"unknown vocab category {category_raw!r}. Valid categories: {valid}",
                path,
                line_no,
            ) from None

        vocab_id = make_vocab_id(devanagari, category.value)
        if vocab_id in seen:
            logger.warning("%s:%s: duplicate vocab id %s, keeping first", path, line_no, vocab_id)
            continue
        seen.add(vocab_id)
        items.append(
            VocabItem(
                id=vocab_id,
                devanagari=devanagari,
                romanized=romanized,
                english=english,
                category=category,
                notes=notes,
                alt_romanizations=_parse_alt_romanizations(notes),
                source_lesson_id=lesson_id,
                introduced_week=introduced_week,
            )
        )
    return items


def _parse_characters_section(
    section: _Section, path: Path, lesson_id: str
) -> list[CharacterItem]:
    """Parse a script reference block: `- क | ka | consonant [| notes]`."""
    items: list[CharacterItem] = []
    seen: set[str] = set()
    for line_no, raw_line in section.lines:
        if _is_ignorable(raw_line):
            continue
        bullet = _BULLET_RE.match(raw_line.strip())
        if not bullet:
            continue
        fields = [f.strip() for f in bullet.group(1).split("|")]
        if len(fields) < 3:
            raise ContentError(
                "character line needs at least 3 fields "
                f"'devanagari | romanized | kind', got {len(fields)}: {bullet.group(1)!r}",
                path,
                line_no,
            )
        devanagari, romanized, kind = fields[:3]
        notes = fields[3] if len(fields) > 3 else None
        if not devanagari or not romanized:
            raise ContentError(
                "character line has an empty devanagari or romanized field", path, line_no
            )
        # Keyed on the character itself, not the romanization: ट and त are both
        # romanized "ta" in most schemes and would otherwise collide.
        char_id = f"char-{slugify(devanagari)}"
        if char_id in seen:
            logger.warning("%s:%s: duplicate character id %s, keeping first", path, line_no, char_id)
            continue
        seen.add(char_id)
        items.append(
            CharacterItem(
                id=char_id,
                devanagari=devanagari,
                romanized=romanized,
                kind=kind,
                notes=notes,
                source_lesson_id=lesson_id,
            )
        )
    return items


def _derive_blank(template: str, filled: str) -> str | None:
    """Work out what fills the template's ___ slot in this example.

    Matches the template's leading and trailing words against the example and
    returns whatever sits between them, so a blank can span several words.
    Returns None when the example does not actually follow the template, which
    is common enough in hand-written content to be worth tolerating.
    """
    if BLANK_MARKER not in template:
        return None
    template_words = template.split()
    filled_words = filled.split()
    try:
        blank_index = next(i for i, w in enumerate(template_words) if BLANK_MARKER in w)
    except StopIteration:
        return None

    prefix = template_words[:blank_index]
    suffix = template_words[blank_index + 1 :]
    if len(filled_words) < len(prefix) + len(suffix):
        return None
    if filled_words[: len(prefix)] != prefix:
        return None
    if suffix and filled_words[len(filled_words) - len(suffix) :] != suffix:
        return None

    middle = filled_words[len(prefix) : len(filled_words) - len(suffix)] if suffix else filled_words[len(prefix) :]
    answer = " ".join(middle).strip()
    return answer or None


def _parse_patterns_section(
    section: _Section, path: Path, lesson_id: str
) -> list[SentencePattern]:
    patterns: list[SentencePattern] = []
    current: SentencePattern | None = None
    used_ids: set[str] = set()

    for line_no, raw_line in section.lines:
        stripped = raw_line.strip()
        if _is_ignorable(raw_line):
            continue

        heading = _HEADING3_RE.match(stripped)
        if heading:
            head_match = _PATTERN_HEAD_RE.match(heading.group(1))
            if not head_match:
                raise ContentError(
                    "sentence pattern heading must read "
                    "'### <devanagari> (<romanized> — <english>)', got "
                    f"{heading.group(1)!r}",
                    path,
                    line_no,
                )
            rest = head_match.group("rest")
            halves = _PATTERN_SEP_RE.split(rest, maxsplit=1)
            if len(halves) != 2:
                raise ContentError(
                    "sentence pattern heading needs an em-dash between the "
                    f"romanization and the English meaning, got {rest!r}",
                    path,
                    line_no,
                )
            template_dev = head_match.group("dev").strip()
            template_rom, template_eng = (h.strip() for h in halves)

            base_id = slugify(template_rom.replace(BLANK_MARKER, "")) or f"pattern-{len(patterns)}"
            pattern_id = f"{lesson_id}:pattern:{base_id}"
            suffix = 2
            while pattern_id in used_ids:
                pattern_id = f"{lesson_id}:pattern:{base_id}-{suffix}"
                suffix += 1
            used_ids.add(pattern_id)

            current = SentencePattern(
                id=pattern_id,
                template_devanagari=template_dev,
                template_romanized=template_rom,
                template_english=template_eng,
            )
            patterns.append(current)
            continue

        bullet = _BULLET_RE.match(stripped)
        if not bullet:
            continue
        if current is None:
            raise ContentError(
                "sentence pattern example appears before any '### template' heading",
                path,
                line_no,
            )
        fields = [f.strip() for f in bullet.group(1).split("|")]
        if len(fields) < 3:
            raise ContentError(
                "sentence pattern example needs 3 fields "
                f"'devanagari | romanized | english', got {len(fields)}: {bullet.group(1)!r}",
                path,
                line_no,
            )
        devanagari, romanized, english = fields[:3]
        current.examples.append(
            SentenceExample(
                devanagari=devanagari,
                romanized=romanized,
                english=english,
                blank_devanagari=_derive_blank(current.template_devanagari, devanagari),
                blank_romanized=_derive_blank(current.template_romanized, romanized),
            )
        )
    return patterns


def _group_turns(section: _Section, path: Path) -> list[tuple[str | None, list[tuple[int, str]]]]:
    """Split a dialogue or passage into turns.

    Speaker comments define turn boundaries when present; otherwise blank lines
    separate paragraphs, each of which becomes a turn.
    """
    has_speakers = any(_SPEAKER_RE.match(line.strip()) for _, line in section.lines)
    turns: list[tuple[str | None, list[tuple[int, str]]]] = []

    if has_speakers:
        speaker: str | None = None
        buffer: list[tuple[int, str]] = []
        started = False
        for line_no, raw_line in section.lines:
            match = _SPEAKER_RE.match(raw_line.strip())
            if match:
                if started and buffer:
                    turns.append((speaker, buffer))
                speaker = match.group(1)
                buffer = []
                started = True
                continue
            if _is_ignorable(raw_line):
                continue
            buffer.append((line_no, raw_line.strip()))
        if buffer:
            turns.append((speaker, buffer))
        return turns

    buffer = []
    for line_no, raw_line in section.lines:
        if not raw_line.strip():
            if buffer:
                turns.append((None, buffer))
                buffer = []
            continue
        if _is_ignorable(raw_line):
            continue
        buffer.append((line_no, raw_line.strip()))
    if buffer:
        turns.append((None, buffer))
    return turns


def _parse_playback_section(
    section: _Section, path: Path, lesson_id: str
) -> list[PlaybackUnit]:
    units: list[PlaybackUnit] = []
    for speaker, lines in _group_turns(section, path):
        if not lines:
            continue
        if len(lines) % 3 != 0:
            first_line = lines[0][0]
            raise ContentError(
                f"a turn must contain groups of exactly 3 lines "
                f"(devanagari, romanized, english); found {len(lines)} lines",
                path,
                first_line,
            )

        turn_index = len(units)
        spans: list[Span] = []
        for triple_start in range(0, len(lines), 3):
            line_no = lines[triple_start][0]
            devanagari = lines[triple_start][1]
            romanized = lines[triple_start + 1][1]
            english = lines[triple_start + 2][1]

            dev_parts = split_sentences(devanagari)
            rom_parts = split_sentences(romanized)
            eng_parts = split_sentences(english)

            if len(dev_parts) == len(rom_parts) == len(eng_parts) and len(dev_parts) > 1:
                triples = zip(dev_parts, rom_parts, eng_parts, strict=True)
            else:
                if len({len(dev_parts), len(rom_parts), len(eng_parts)}) > 1:
                    logger.warning(
                        "%s:%s: sentence counts differ across the three lines "
                        "(%d/%d/%d); treating the turn line as a single span",
                        path,
                        line_no,
                        len(dev_parts),
                        len(rom_parts),
                        len(eng_parts),
                    )
                triples = iter([(devanagari, romanized, english)])

            for dev, rom, eng in triples:
                span_index = len(spans)
                spans.append(
                    Span(
                        id=f"{lesson_id}:{turn_index}:{span_index}",
                        turn_index=turn_index,
                        span_index=span_index,
                        devanagari=dev,
                        romanized=rom,
                        english=eng,
                    )
                )

        units.append(PlaybackUnit(turn_index=turn_index, speaker=speaker, spans=spans))
    return units


# --------------------------------------------------------------------------
# Frontmatter
# --------------------------------------------------------------------------

def _require(meta: dict, key: str, path: Path):
    if key not in meta or meta[key] in (None, ""):
        raise ContentError(f"frontmatter is missing required field {key!r}", path)
    return meta[key]


def _parse_frontmatter(meta: dict, path: Path, expected_id: str) -> dict:
    lesson_id = str(_require(meta, "id", path)).strip()
    if lesson_id != expected_id:
        raise ContentError(
            f"frontmatter id {lesson_id!r} must match the filename stem {expected_id!r}",
            path,
        )

    skill_raw = str(_require(meta, "skill_type", path)).strip().lower()
    try:
        skill_type = SkillType(skill_raw)
    except ValueError:
        valid = ", ".join(s.value for s in SkillType)
        raise ContentError(
            f"unknown skill_type {skill_raw!r}. Valid values: {valid}", path
        ) from None

    status_raw = str(meta.get("status", "stub")).strip().lower()
    try:
        status = ContentStatus(status_raw)
    except ValueError:
        valid = ", ".join(s.value for s in ContentStatus)
        raise ContentError(
            f"unknown status {status_raw!r}. Valid values: {valid}", path
        ) from None

    categories: list[VocabCategory] = []
    for raw in meta.get("vocab_categories") or []:
        try:
            categories.append(VocabCategory(str(raw).strip().lower()))
        except ValueError:
            valid = ", ".join(c.value for c in VocabCategory)
            raise ContentError(
                f"unknown vocab category {raw!r} in frontmatter. Valid categories: {valid}",
                path,
            ) from None

    try:
        week = int(_require(meta, "week", path))
    except (TypeError, ValueError):
        raise ContentError(f"week must be a number, got {meta.get('week')!r}", path) from None

    day = meta.get("day")
    if day is not None:
        try:
            day = int(day)
        except (TypeError, ValueError):
            raise ContentError(f"day must be a number, got {day!r}", path) from None

    return {
        "id": lesson_id,
        "title": str(_require(meta, "title", path)),
        "week": week,
        "day": day,
        "skill_type": skill_type,
        "tags": [str(t) for t in (meta.get("tags") or [])],
        "vocab_categories": categories,
        "difficulty": int(meta.get("difficulty") or week),
        "prerequisites": [str(p) for p in (meta.get("prerequisites") or [])],
        "estimated_minutes": meta.get("estimated_minutes"),
        "status": status,
    }


# --------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------

def parse_lesson_file(path: Path) -> Lesson:
    """Parse one lesson markdown file into a Lesson."""
    raw_text = path.read_text(encoding="utf-8")
    try:
        post = frontmatter.loads(raw_text)
    except Exception as exc:  # malformed YAML
        raise ContentError(f"could not parse frontmatter: {exc}", path) from exc

    meta = _parse_frontmatter(dict(post.metadata), path, expected_id=path.stem)
    lines = _strip_comments(_body_lines(raw_text))
    sections = _split_sections(lines)

    vocab: list[VocabItem] = []
    patterns: list[SentencePattern] = []
    turns: list[PlaybackUnit] = []
    characters: list[CharacterItem] = []
    is_dialogue = False
    notes_chunks: list[str] = []

    for section in sections:
        if section.kind == "characters":
            characters.extend(_parse_characters_section(section, path, meta["id"]))
        elif section.kind == "vocab":
            vocab.extend(
                _parse_vocab_section(
                    section,
                    path,
                    lesson_id=meta["id"],
                    introduced_week=meta["week"],
                )
            )
        elif section.kind == "patterns":
            patterns.extend(_parse_patterns_section(section, path, meta["id"]))
        elif section.kind in {"dialogue", "passage"}:
            if turns:
                raise ContentError(
                    "a lesson may contain only one Dialogue or Passage section, "
                    "because playback positions are indexed per lesson",
                    path,
                )
            is_dialogue = section.kind == "dialogue"
            turns = _parse_playback_section(section, path, meta["id"])
        else:
            body = "\n".join(line for _, line in section.lines).strip()
            if section.heading or body:
                header = f"## {section.heading}\n" if section.heading else ""
                if body:
                    notes_chunks.append(f"{header}{body}")

    span_count = sum(len(turn.spans) for turn in turns)
    return Lesson(
        **meta,
        vocab=vocab,
        patterns=patterns,
        turns=turns,
        characters=characters,
        is_dialogue=is_dialogue,
        notes_markdown="\n\n".join(notes_chunks) or None,
        vocab_count=len(vocab),
        pattern_count=len(patterns),
        span_count=span_count,
        character_count=len(characters),
        has_audio_content=span_count > 0,
        source_path=str(path),
    )


def parse_vocab_bank_file(path: Path) -> list[VocabItem]:
    """Parse a standalone vocabulary bank from content/vocab/."""
    raw_text = path.read_text(encoding="utf-8")
    try:
        post = frontmatter.loads(raw_text)
    except Exception as exc:
        raise ContentError(f"could not parse frontmatter: {exc}", path) from exc

    meta = dict(post.metadata)
    introduced_week = meta.get("introduced_week")
    if introduced_week is not None:
        try:
            introduced_week = int(introduced_week)
        except (TypeError, ValueError):
            raise ContentError(
                f"introduced_week must be a number, got {introduced_week!r}", path
            ) from None

    lines = _strip_comments(_body_lines(raw_text))
    items: list[VocabItem] = []
    for section in _split_sections(lines):
        if section.kind != "vocab":
            continue
        items.extend(
            _parse_vocab_section(
                section, path, lesson_id=None, introduced_week=introduced_week
            )
        )
    return items
