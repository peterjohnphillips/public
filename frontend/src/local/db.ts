/**
 * Browser-local stand-in for the FastAPI backend's SQLite database.
 *
 * The full-stack app keeps SRS scheduling, review history, streaks and session
 * scores in SQLite because that state must survive a cleared browser. In the
 * static GitHub Pages build there is no server, so this is the durable record:
 * one localStorage key per table. It is still the *record* (as opposed to the
 * resume/presentation state under persistence/), it just cannot outlive the
 * browser it was created in.
 */

const PREFIX = "nepali:db:v1:";

export interface VocabProgressRow {
  vocab_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string; // YYYY-MM-DD
  last_reviewed_at: string | null;
  last_quality: number | null;
  total_reviews: number;
  total_correct: number;
  introduced_at: string;
}

export interface ReviewLogRow {
  vocab_id: string;
  reviewed_at: string;
  quality: number;
  game_mode: string;
  response_time_ms: number | null;
}

export interface LessonProgressRow {
  lesson_id: string;
  status: "not_started" | "in_progress" | "completed";
  first_started_at: string | null;
  completed_at: string | null;
  times_practiced: number;
}

export interface GameSessionRow {
  id: number;
  game_mode: string;
  lesson_id: string | null;
  client_session_key: string | null;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  total_items: number;
  correct_items: number;
  duration_seconds: number | null;
}

export interface GameSessionItemRow {
  id: number;
  session_id: number;
  item_ref: string;
  was_correct: boolean;
  response_time_ms: number | null;
  user_answer: string | null;
  answered_at: string;
  client_answer_key: string | null;
}

export interface DailyStreakRow {
  day: string; // YYYY-MM-DD
  minutes_active: number;
  sessions_completed: number;
  day_curriculum_index: number | null;
}

export interface AudioProgressRow {
  lesson_id: string;
  spans_listened: number;
  span_ids: string[];
  seconds_listened: number;
  completed: boolean;
  updated_at: string;
}

interface Schema {
  vocabProgress: Record<string, VocabProgressRow>;
  reviewLog: ReviewLogRow[];
  lessonProgress: Record<string, LessonProgressRow>;
  gameSessions: GameSessionRow[];
  gameSessionItems: GameSessionItemRow[];
  dailyStreak: Record<string, DailyStreakRow>;
  audioProgress: Record<string, AudioProgressRow>;
  userSettings: Record<string, string>;
  seq: { gameSessions: number; gameSessionItems: number };
}

const EMPTY: { [K in keyof Schema]: () => Schema[K] } = {
  vocabProgress: () => ({}),
  reviewLog: () => [],
  lessonProgress: () => ({}),
  gameSessions: () => [],
  gameSessionItems: () => [],
  dailyStreak: () => ({}),
  audioProgress: () => ({}),
  userSettings: () => ({}),
  seq: () => ({ gameSessions: 0, gameSessionItems: 0 }),
};

function read<K extends keyof Schema>(table: K): Schema[K] {
  try {
    const raw = window.localStorage.getItem(PREFIX + table);
    if (raw === null) return EMPTY[table]();
    return JSON.parse(raw) as Schema[K];
  } catch {
    return EMPTY[table]();
  }
}

function write<K extends keyof Schema>(table: K, value: Schema[K]): void {
  try {
    window.localStorage.setItem(PREFIX + table, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory result of this request still
    // returns; the write is simply lost, same failure mode as the real
    // backend being unreachable.
  }
}

/** Read, mutate, persist one table in a single call. */
export function tx<K extends keyof Schema, R>(table: K, fn: (value: Schema[K]) => R): R {
  const value = read(table);
  const result = fn(value);
  write(table, value);
  return result;
}

export function get<K extends keyof Schema>(table: K): Schema[K] {
  return read(table);
}

export function nextId(kind: keyof Schema["seq"]): number {
  return tx("seq", (seq) => {
    seq[kind] += 1;
    return seq[kind];
  });
}

export type { Schema };
