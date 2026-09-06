/**
 * Mirrors backend/app/models/schemas.py one-for-one. Keep these in sync by
 * hand: there is no codegen step, so a backend field rename must be reflected
 * here too.
 */

export type VocabCategory =
  | "people"
  | "food"
  | "places"
  | "time"
  | "feelings"
  | "verbs"
  | "questions"
  | "social";

export const VOCAB_CATEGORIES: VocabCategory[] = [
  "people",
  "food",
  "places",
  "time",
  "feelings",
  "verbs",
  "questions",
  "social",
];

export type SkillType =
  | "pronunciation"
  | "vocab"
  | "sentence-pattern"
  | "conversation"
  | "reading"
  | "listening";

export type ContentStatus = "stub" | "sample" | "final";

export type MasteryBucket = "new" | "learning" | "young" | "mature";

export interface VocabItem {
  id: string;
  devanagari: string;
  romanized: string;
  english: string;
  category: VocabCategory;
  notes: string | null;
  alt_romanizations: string[];
  source_lesson_id: string | null;
  introduced_week: number | null;
}

export interface VocabProgress {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string; // ISO date
  last_reviewed_at: string | null;
  total_reviews: number;
  total_correct: number;
  bucket: MasteryBucket;
  is_due: boolean;
}

export interface VocabItemOut extends VocabItem {
  progress: VocabProgress | null;
}

export interface Span {
  id: string;
  turn_index: number;
  span_index: number;
  devanagari: string;
  romanized: string;
  english: string;
}

export interface PlaybackUnit {
  turn_index: number;
  speaker: string | null;
  spans: Span[];
}

export interface SentenceExample {
  devanagari: string;
  romanized: string;
  english: string;
  blank_devanagari: string | null;
  blank_romanized: string | null;
}

export interface SentencePattern {
  id: string;
  template_devanagari: string;
  template_romanized: string;
  template_english: string;
  examples: SentenceExample[];
}

export interface CharacterItem {
  id: string;
  devanagari: string;
  romanized: string;
  kind: string;
  notes: string | null;
  source_lesson_id: string | null;
}

export interface LessonMilestone {
  key: "opened" | "vocab" | "listening" | "practice";
  label: string;
  done: boolean;
  /** Human-readable partial progress, e.g. "9 / 12 words". */
  detail: string | null;
}

export interface LessonSummary {
  id: string;
  title: string;
  week: number;
  day: number | null;
  skill_type: SkillType;
  tags: string[];
  vocab_categories: VocabCategory[];
  difficulty: number;
  prerequisites: string[];
  estimated_minutes: number | null;
  status: ContentStatus;
  vocab_count: number;
  pattern_count: number;
  span_count: number;
  character_count: number;
  has_audio_content: boolean;
  progress_status: "not_started" | "in_progress" | "completed";
  times_practiced: number;
  due_vocab_count: number;
  /** Fraction of applicable milestones completed (0-1). Drives the real
   * progress ring, replacing the old not_started/in_progress/completed guess. */
  progress_fraction: number;
  milestones: LessonMilestone[];
}

export interface Lesson extends LessonSummary {
  vocab: VocabItem[];
  patterns: SentencePattern[];
  turns: PlaybackUnit[];
  characters: CharacterItem[];
  is_dialogue: boolean;
  notes_markdown: string | null;
  source_path: string | null;
}

// --------------------------------------------------------------------------
// Sessions
// --------------------------------------------------------------------------

export interface SessionStartRequest {
  game_mode: string;
  lesson_id?: string | null;
  client_session_key?: string | null;
}

export interface SessionStartResponse {
  session_id: number;
  game_mode: string;
  lesson_id: string | null;
  resumed: boolean;
  answered_item_refs: string[];
}

export interface AnswerRequest {
  item_ref: string;
  was_correct: boolean;
  quality?: number | null;
  response_time_ms?: number | null;
  user_answer?: string | null;
  client_answer_key?: string | null;
}

export interface AnswerResponse {
  recorded: boolean;
  duplicate: boolean;
  srs_applied: boolean;
  next_due_date: string | null;
  next_interval_days: number | null;
  ease_factor: number | null;
}

export interface SessionFinishResponse {
  session_id: number;
  score: number | null;
  total_items: number;
  correct_items: number;
  duration_seconds: number | null;
  streak_days: number;
}

export interface SessionItemOut {
  item_ref: string;
  was_correct: boolean;
  user_answer: string | null;
  response_time_ms: number | null;
  answered_at: string;
}

export interface SessionOut {
  id: number;
  game_mode: string;
  lesson_id: string | null;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  total_items: number;
  correct_items: number;
  duration_seconds: number | null;
  items: SessionItemOut[];
}

// --------------------------------------------------------------------------
// Progress
// --------------------------------------------------------------------------

export interface ProgressSummary {
  streak_days: number;
  longest_streak_days: number;
  practiced_today: boolean;
  minutes_today: number;
  sessions_today: number;
  vocab_due_count: number;
  vocab_total: number;
  vocab_introduced: number;
  lessons_completed: number;
  lessons_in_progress: number;
  lessons_total: number;
  lessons_with_content: number;
  curriculum_day: number;
  curriculum_week: number;
  week_focus: string;
  sessions_this_week: number;
  content_is_placeholder: boolean;
}

export interface StreakDay {
  date: string;
  minutes_active: number;
  sessions_completed: number;
  day_curriculum_index: number | null;
}

export interface CategoryMastery {
  category: VocabCategory;
  new: number;
  learning: number;
  young: number;
  mature: number;
  total: number;
}

export interface VocabMastery {
  categories: CategoryMastery[];
  totals: CategoryMastery | null;
  milestone_target: number;
  milestone_label: string;
}

export interface GameModeStat {
  game_mode: string;
  sessions: number;
  items: number;
  correct: number;
  accuracy: number | null;
  last_played_at: string | null;
}

export interface WeakItem {
  vocab_id: string;
  devanagari: string;
  romanized: string;
  english: string;
  category: VocabCategory;
  ease_factor: number;
  total_reviews: number;
  total_correct: number;
  accuracy: number | null;
}

export interface ListeningStats {
  spans_listened: number;
  minutes_listened: number;
  passages_completed: number;
  lessons_with_audio_progress: number;
}

export interface AudioProgressPayload {
  lesson_id: string;
  span_ids_listened: string[];
  seconds_listened: number;
  completed: boolean;
}

export interface CurriculumPhase {
  key: string;
  label: string;
  focus: string;
  first_day: number;
  last_day: number;
  vocab_target: number;
  daily_minutes: number;
}

export interface ContentLoadError {
  path: string;
  line: number | null;
  reason: string;
}
