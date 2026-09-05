"""Pydantic models: parsed content structures and API request/response shapes.

The content models here mirror the markdown schema documented in
`docs/content-authoring-guide.md` one-for-one, and are returned directly by the
routers, so the frontend types in `frontend/src/types/content.ts` mirror these.
"""

from __future__ import annotations

from datetime import date, datetime
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


class MasteryBucket(str, Enum):
    NEW = "new"
    LEARNING = "learning"
    YOUNG = "young"
    MATURE = "mature"


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


# --------------------------------------------------------------------------
# Vocab + SRS
# --------------------------------------------------------------------------

class VocabProgressOut(BaseModel):
    ease_factor: float
    interval_days: int
    repetitions: int
    due_date: date
    last_reviewed_at: datetime | None = None
    total_reviews: int
    total_correct: int
    bucket: MasteryBucket
    is_due: bool


class VocabItemOut(VocabItem):
    progress: VocabProgressOut | None = None


# --------------------------------------------------------------------------
# Game sessions
# --------------------------------------------------------------------------

class SessionStartIn(BaseModel):
    game_mode: str
    lesson_id: str | None = None
    client_session_key: str | None = Field(
        default=None,
        description="Client-generated idempotency key, so a resumed in-flight "
        "session reattaches to its existing row instead of creating a duplicate.",
    )


class SessionStartOut(BaseModel):
    session_id: int
    game_mode: str
    lesson_id: str | None = None
    resumed: bool = False
    answered_item_refs: list[str] = Field(default_factory=list)


class AnswerIn(BaseModel):
    item_ref: str
    was_correct: bool
    quality: int | None = Field(default=None, ge=0, le=5)
    response_time_ms: int | None = None
    user_answer: str | None = None
    client_answer_key: str | None = Field(
        default=None,
        description="Idempotency key so an outbox replay does not double-count.",
    )


class AnswerOut(BaseModel):
    recorded: bool
    duplicate: bool = False
    srs_applied: bool = False
    next_due_date: date | None = None
    next_interval_days: int | None = None
    ease_factor: float | None = None


class SessionFinishOut(BaseModel):
    session_id: int
    score: float | None
    total_items: int
    correct_items: int
    duration_seconds: int | None
    streak_days: int


class SessionItemOut(BaseModel):
    item_ref: str
    was_correct: bool
    user_answer: str | None = None
    response_time_ms: int | None = None
    answered_at: datetime


class SessionOut(BaseModel):
    id: int
    game_mode: str
    lesson_id: str | None
    started_at: datetime
    completed_at: datetime | None
    score: float | None
    total_items: int
    correct_items: int
    duration_seconds: int | None
    items: list[SessionItemOut] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Progress
# --------------------------------------------------------------------------

class ProgressSummary(BaseModel):
    streak_days: int
    longest_streak_days: int
    practiced_today: bool
    minutes_today: int
    sessions_today: int
    vocab_due_count: int
    vocab_total: int
    vocab_introduced: int
    lessons_completed: int
    lessons_total: int
    lessons_with_content: int
    curriculum_day: int
    curriculum_week: int
    week_focus: str
    sessions_this_week: int
    content_is_placeholder: bool


class StreakDay(BaseModel):
    date: date
    minutes_active: int
    sessions_completed: int
    day_curriculum_index: int | None = None


class CategoryMastery(BaseModel):
    category: VocabCategory
    new: int
    learning: int
    young: int
    mature: int
    total: int


class VocabMastery(BaseModel):
    categories: list[CategoryMastery]
    totals: CategoryMastery | None = None
    milestone_target: int
    milestone_label: str


class GameModeStat(BaseModel):
    game_mode: str
    sessions: int
    items: int
    correct: int
    accuracy: float | None
    last_played_at: datetime | None


class WeakItem(BaseModel):
    vocab_id: str
    devanagari: str
    romanized: str
    english: str
    category: VocabCategory
    ease_factor: float
    total_reviews: int
    total_correct: int
    accuracy: float | None


class ListeningStats(BaseModel):
    spans_listened: int
    minutes_listened: int
    passages_completed: int
    lessons_with_audio_progress: int


class AudioProgressIn(BaseModel):
    """Mirror of the client's local audio record, so listening time survives a cleared browser."""

    lesson_id: str
    span_ids_listened: list[str] = Field(default_factory=list)
    seconds_listened: int = 0
    completed: bool = False
