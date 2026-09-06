"""Pydantic models for the parsed content structures.

These mirror the markdown schema documented in
`docs/content-authoring-guide.md` one-for-one. `scripts/build_content.py`
serialises them into `frontend/src/generated/content.json`, and the frontend
types in `frontend/src/types/content.ts` mirror these.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# Enumerations
# --------------------------------------------------------------------------

class VocabCategory(str, Enum):
    """The eight categories, in the curriculum's stated priority order."""

    PEOPLE = "people"
    FOOD = "food"
    PLACES = "places"
    TIME = "time"
    FEELINGS = "feelings"
    VERBS = "verbs"
    QUESTIONS = "questions"
    SOCIAL = "social"


class SkillType(str, Enum):
    PRONUNCIATION = "pronunciation"
    VOCAB = "vocab"
    SENTENCE_PATTERN = "sentence-pattern"
    CONVERSATION = "conversation"
    READING = "reading"
    LISTENING = "listening"


class ContentStatus(str, Enum):
    """Authoring state. Stub and sample lessons are excluded from progress totals."""

    STUB = "stub"
    SAMPLE = "sample"
    FINAL = "final"


# --------------------------------------------------------------------------
# Parsed content
# --------------------------------------------------------------------------

class VocabItem(BaseModel):
    """One vocabulary entry, from a lesson's Vocab block or a category bank."""

    id: str = Field(description="Stable id: slug(devanagari)-category. Joins to VocabProgress.")
    devanagari: str
    romanized: str
    english: str
    category: VocabCategory
    notes: str | None = None
    alt_romanizations: list[str] = Field(
        default_factory=list,
        description="Accepted alternates for typing drills, parsed from the notes field.",
    )
    source_lesson_id: str | None = None
    introduced_week: int | None = None


class Span(BaseModel):
    """A single sentence within a turn. The unit of TTS playback and highlighting."""

    id: str = Field(description="'{lesson_id}:{turn_index}:{span_index}'")
    turn_index: int
    span_index: int
    devanagari: str
    romanized: str
    english: str


class PlaybackUnit(BaseModel):
    """One dialogue turn or passage paragraph. The pause boundary during playback."""

    turn_index: int
    speaker: str | None = None
    spans: list[Span]

    @property
    def devanagari(self) -> str:
        return " ".join(s.devanagari for s in self.spans)


class SentenceExample(BaseModel):
    devanagari: str
    romanized: str
    english: str
    blank_devanagari: str | None = Field(
        default=None,
        description="The word(s) filling the template's ___ slot, derived at parse "
        "time by aligning the template against this example. None when alignment "
        "failed, in which case fill-in-the-blank skips this example.",
    )
    blank_romanized: str | None = None


class SentencePattern(BaseModel):
    """A reusable template such as 'म ___ हुँ', with its filled examples."""

    id: str
    template_devanagari: str
    template_romanized: str
    template_english: str
    examples: list[SentenceExample] = Field(default_factory=list)


class CharacterItem(BaseModel):
    """One Devanagari character or vowel sign, for the script recognition drill.

    Kept separate from VocabItem because a letter has no meaningful vocabulary
    category, but it shares the SRS tables under a `char-` id prefix.
    """

    id: str = Field(description="'char-{devanagari}'")
    devanagari: str
    romanized: str
    kind: str = Field(description="Free text: vowel, consonant, matra, numeral, conjunct.")
    notes: str | None = None
    source_lesson_id: str | None = None


class LessonSummary(BaseModel):
    """Listing shape, without the lesson body."""

    id: str
    title: str
    week: int
    day: int | None = None
    skill_type: SkillType
    tags: list[str] = Field(default_factory=list)
    vocab_categories: list[VocabCategory] = Field(default_factory=list)
    difficulty: int = 1
    prerequisites: list[str] = Field(default_factory=list)
    estimated_minutes: int | None = None
    status: ContentStatus = ContentStatus.STUB
    vocab_count: int = 0
    pattern_count: int = 0
    span_count: int = 0
    character_count: int = 0
    has_audio_content: bool = False
    progress_status: str = "not_started"
    times_practiced: int = 0
    due_vocab_count: int = 0


class Lesson(LessonSummary):
    """Full lesson detail."""

    vocab: list[VocabItem] = Field(default_factory=list)
    patterns: list[SentencePattern] = Field(default_factory=list)
    turns: list[PlaybackUnit] = Field(default_factory=list)
    characters: list[CharacterItem] = Field(default_factory=list)
    is_dialogue: bool = False
    notes_markdown: str | None = None
    source_path: str | None = None
