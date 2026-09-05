"""The content schema is locked by these tests.

They parse the real files in content/, so a format change that breaks authoring
shows up here rather than as an empty game later.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.content.loader import load_content
from app.content.parser import (
    ContentError,
    _derive_blank,
    parse_lesson_file,
    split_sentences,
)
from app.models.schemas import ContentStatus, SkillType, VocabCategory


@pytest.fixture(scope="module")
def store(lessons_dir: Path, vocab_dir: Path):
    return load_content(lessons_dir, vocab_dir)


def test_all_content_parses_without_errors(store):
    assert store.errors == [], f"content failed to parse: {store.errors}"


def test_whole_curriculum_is_present(store):
    days = {lesson.day for lesson in store.lesson_list if lesson.day is not None}
    missing = sorted(set(range(1, 29)) - days)
    assert not missing, f"no lesson file covers day(s) {missing}"


def test_lesson_ids_match_filenames(store):
    for lesson in store.lesson_list:
        assert lesson.id == Path(lesson.source_path).stem


# --------------------------------------------------------------------------
# Day 1: vocab block, pattern, speaker dialogue
# --------------------------------------------------------------------------

def test_day01_parses_vocab_and_dialogue(store):
    lesson = store.lessons["day01-pronunciation"]
    assert lesson.skill_type is SkillType.PRONUNCIATION
    assert lesson.status is ContentStatus.SAMPLE
    assert lesson.vocab_count == 10
    assert lesson.is_dialogue is True
    assert len(lesson.turns) == 4
    assert [turn.speaker for turn in lesson.turns] == ["Sunita", "Ram", "Sunita", "Ram"]
    # The first turn's line ("Namaste! How are you?") holds two sentences and
    # splits into two spans; the other three turns are one sentence each.
    assert lesson.span_count == 5
    assert lesson.has_audio_content is True


def test_day01_vocab_fields(store):
    lesson = store.lessons["day01-pronunciation"]
    namaste = next(item for item in lesson.vocab if item.romanized == "namaste")
    assert namaste.devanagari == "नमस्ते"
    assert namaste.english == "hello / greetings"
    assert namaste.category is VocabCategory.SOCIAL
    assert namaste.source_lesson_id == "day01-pronunciation"
    assert namaste.introduced_week == 1


def test_alt_romanizations_are_extracted(store):
    lesson = store.lessons["day01-pronunciation"]
    thanks = next(item for item in lesson.vocab if item.romanized == "dhanyabaad")
    assert thanks.alt_romanizations == ["dhanyabad", "dhanyawad"]


def test_notes_field_without_alts_yields_no_alts(store):
    lesson = store.lessons["day01-pronunciation"]
    chha = next(item for item in lesson.vocab if item.devanagari == "छ")
    assert chha.notes is not None
    assert chha.alt_romanizations == ["cha"]


# --------------------------------------------------------------------------
# Day 4: sentence patterns and blank derivation
# --------------------------------------------------------------------------

def test_day04_patterns(store):
    lesson = store.lessons["day04-sentence-patterns"]
    assert lesson.pattern_count == 4
    first = lesson.patterns[0]
    assert first.template_devanagari == "म ___ हुँ"
    assert first.template_romanized == "Ma ___ hu"
    assert first.template_english == "I am ___"
    assert len(first.examples) == 3


def test_blanks_are_derived_from_templates(store):
    lesson = store.lessons["day04-sentence-patterns"]
    first = lesson.patterns[0]
    assert first.examples[0].blank_devanagari == "विद्यार्थी"
    assert first.examples[0].blank_romanized == "bidyarthi"

    like = next(p for p in lesson.patterns if "मन पर्छ" in p.template_devanagari)
    assert like.examples[0].blank_devanagari == "चिया"
    assert like.examples[0].blank_romanized == "chiya"


def test_pattern_ids_are_unique_and_namespaced(store):
    lesson = store.lessons["day04-sentence-patterns"]
    ids = [pattern.id for pattern in lesson.patterns]
    assert len(ids) == len(set(ids))
    assert all(pid.startswith("day04-sentence-patterns:pattern:") for pid in ids)


@pytest.mark.parametrize(
    "template,filled,expected",
    [
        ("म ___ हुँ", "म विद्यार्थी हुँ", "विद्यार्थी"),
        ("Ma ___ hu", "Ma amerikee hu", "amerikee"),
        ("Malai ___ man parchha", "Malai chiya man parchha", "chiya"),
        # A blank spanning several words.
        ("Ma ___ garna chahanchhu", "Ma kura garna chahanchhu", "kura"),
        # Trailing blank, nothing after it.
        ("I am ___", "I am a student", "a student"),
        # Example that does not follow the template at all.
        ("म ___ हुँ", "यो राम्रो छ", None),
        # No blank marker in the template.
        ("म हुँ", "म हुँ", None),
    ],
)
def test_derive_blank(template, filled, expected):
    assert _derive_blank(template, filled) == expected


# --------------------------------------------------------------------------
# Passage: multi-sentence spans
# --------------------------------------------------------------------------

def test_reading_passage_splits_into_sentence_spans(store):
    lesson = store.lessons["reading-passage-01"]
    assert lesson.is_dialogue is False
    assert len(lesson.turns) == 4
    # Each line in this passage holds two sentences.
    assert all(len(turn.spans) == 2 for turn in lesson.turns)
    assert lesson.span_count == 8

    first = lesson.turns[0].spans[0]
    assert first.devanagari == "काठमाडौं नेपालको राजधानी हो।"
    assert first.english == "Kathmandu is the capital of Nepal."
    assert first.id == "reading-passage-01:0:0"


def test_span_ids_are_unique_across_a_lesson(store):
    for lesson in store.lesson_list:
        ids = [span.id for turn in lesson.turns for span in turn.spans]
        assert len(ids) == len(set(ids)), f"duplicate span ids in {lesson.id}"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("काठमाडौं नेपालको राजधानी हो। यो ठूलो सहर हो।", 2),
        ("Kathmandu is the capital. It is big.", 2),
        ("नमस्ते! तपाईंलाई कस्तो छ?", 2),
        ("no terminal punctuation", 1),
        ("", 0),
    ],
)
def test_split_sentences(text, expected):
    assert len(split_sentences(text)) == expected


# --------------------------------------------------------------------------
# Dialogue with multiple sentences in one turn
# --------------------------------------------------------------------------

def test_cafe_dialogue_turn_with_two_sentences(store):
    lesson = store.lessons["week02-conversation-cafe"]
    assert len(lesson.turns) == 6
    # "I am drinking tea. Where are you going?" is one turn, two spans.
    second = lesson.turns[1]
    assert second.speaker == "Ram"
    assert len(second.spans) == 2
    assert second.spans[1].english == "Where are you going?"


# --------------------------------------------------------------------------
# Script characters
# --------------------------------------------------------------------------

def test_script_lesson_characters(store):
    lesson = store.lessons["script-devanagari"]
    assert lesson.character_count > 50
    kinds = {char.kind for char in lesson.characters}
    assert {"vowel", "consonant", "matra", "numeral"} <= kinds


def test_retroflex_and_dental_do_not_collide(store):
    """Both romanize to "ta"; ids key off the character so both survive."""
    ids = {char.id for char in store.characters.values()}
    assert "char-ट" in ids
    assert "char-त" in ids
    assert len(store.characters) == store.lessons["script-devanagari"].character_count


def test_characters_are_in_the_srs_pool(store):
    srs_ids = set(store.srs_item_ids)
    assert "char-क" in srs_ids
    assert any(not i.startswith("char-") for i in srs_ids)


# --------------------------------------------------------------------------
# Vocabulary pool
# --------------------------------------------------------------------------

def test_vocab_pool_merges_lessons_and_banks(store):
    assert len(store.vocab) >= 40
    ghar = store.vocab["घर-places"]
    assert ghar.english == "house / home"
    assert ghar.category is VocabCategory.PLACES


def test_vocab_ids_are_stable_and_unique(store):
    for vocab_id, item in store.vocab.items():
        assert vocab_id.endswith(f"-{item.category.value}")
        assert item.devanagari in vocab_id


def test_stub_lessons_are_marked_as_such(store):
    stubs = [lesson for lesson in store.lesson_list if lesson.status is ContentStatus.STUB]
    assert len(stubs) == 24
    assert store.has_real_content is False


def test_stub_lessons_parse_to_empty_blocks(store):
    stub = store.lessons["day02-survival-phrases"]
    assert stub.vocab == []
    assert stub.patterns == []
    assert stub.turns == []
    assert stub.has_audio_content is False


# --------------------------------------------------------------------------
# Failure reporting
# --------------------------------------------------------------------------

def _write(tmp_path: Path, name: str, body: str) -> Path:
    path = tmp_path / f"{name}.md"
    path.write_text(body, encoding="utf-8")
    return path


def test_unknown_category_names_the_file_and_line(tmp_path):
    path = _write(
        tmp_path,
        "bad-category",
        """---
id: bad-category
title: "Bad"
week: 1
day: 1
skill_type: vocab
---

## Vocab

- घर | ghar | house | buildings
""",
    )
    with pytest.raises(ContentError) as exc:
        parse_lesson_file(path)
    assert exc.value.line == 11
    assert "buildings" in str(exc.value)
    assert "bad-category.md" in str(exc.value)


def test_short_vocab_line_is_rejected(tmp_path):
    path = _write(
        tmp_path,
        "short-line",
        """---
id: short-line
title: "Short"
week: 1
day: 1
skill_type: vocab
---

## Vocab

- घर | ghar | house
""",
    )
    with pytest.raises(ContentError) as exc:
        parse_lesson_file(path)
    assert "at least 4 fields" in str(exc.value)
    assert exc.value.line == 11


def test_turn_with_wrong_line_count_is_rejected(tmp_path):
    path = _write(
        tmp_path,
        "bad-turn",
        """---
id: bad-turn
title: "Bad turn"
week: 1
day: 1
skill_type: conversation
---

## Dialogue

<!-- speaker: Ram -->
नमस्ते।
Namaste.
""",
    )
    with pytest.raises(ContentError) as exc:
        parse_lesson_file(path)
    assert "groups of exactly 3 lines" in str(exc.value)


def test_id_must_match_filename(tmp_path):
    path = _write(
        tmp_path,
        "actual-name",
        """---
id: different-name
title: "Mismatch"
week: 1
day: 1
skill_type: vocab
---
""",
    )
    with pytest.raises(ContentError) as exc:
        parse_lesson_file(path)
    assert "must match the filename stem" in str(exc.value)


def test_unknown_skill_type_is_rejected(tmp_path):
    path = _write(
        tmp_path,
        "bad-skill",
        """---
id: bad-skill
title: "Bad skill"
week: 1
day: 1
skill_type: telepathy
---
""",
    )
    with pytest.raises(ContentError) as exc:
        parse_lesson_file(path)
    assert "telepathy" in str(exc.value)


def test_misaligned_sentence_counts_fall_back_to_one_span(tmp_path, caplog):
    """Hand-written content will not always split evenly. That must warn, not fail."""
    path = _write(
        tmp_path,
        "misaligned",
        """---
id: misaligned
title: "Misaligned"
week: 1
day: 1
skill_type: reading
---

## Passage

पहिलो वाक्य। दोस्रो वाक्य।
Pahilo waakya ra dosro waakya.
First sentence. Second sentence.
""",
    )
    lesson = parse_lesson_file(path)
    assert lesson.span_count == 1
    assert lesson.turns[0].spans[0].devanagari == "पहिलो वाक्य। दोस्रो वाक्य।"


def test_unknown_section_is_kept_as_notes(tmp_path):
    path = _write(
        tmp_path,
        "odd-section",
        """---
id: odd-section
title: "Odd"
week: 1
day: 1
skill_type: vocab
---

## Grammar Corner

Something the parser does not model.
""",
    )
    lesson = parse_lesson_file(path)
    assert lesson.notes_markdown is not None
    assert "Grammar Corner" in lesson.notes_markdown
    assert "does not model" in lesson.notes_markdown
