/**
 * In-browser reimplementation of the FastAPI `/api` surface, so the app runs
 * as a single static file on GitHub Pages with no server.
 *
 * Every route mirrors backend/app/routers/*.py as closely as practical; the
 * response shapes match backend/app/models/schemas.py (and therefore
 * frontend/src/types/content.ts) field-for-field. The frontend calls these
 * through api/client.ts exactly as it called the real backend.
 */

import contentJson from "../generated/content.json";
import {
  get,
  nextId,
  tx,
  type AudioProgressRow,
  type DailyStreakRow,
  type GameSessionRow,
  type LessonProgressRow,
  type VocabProgressRow,
} from "./db";
import {
  addDays,
  daysBetween,
  gradeFromCorrectness,
  initialState,
  masteryBucket,
  nextState,
  todayIso,
} from "./srs";
import { PHASES, currentDay, phaseForDay, weekForDay } from "./curriculum";

// --------------------------------------------------------------------------
// Content store (the build-time parse of content/, see scripts/build_content.py)
// --------------------------------------------------------------------------

interface RawContent {
  lessons: Record<string, Record<string, unknown>>;
  lesson_order: string[];
  vocab: Record<string, Record<string, unknown>>;
  characters: Record<string, Record<string, unknown>>;
  srs_item_ids: string[];
  errors: { path: string; line: number | null; reason: string }[];
  has_real_content: boolean;
}

const CONTENT = contentJson as unknown as RawContent;

const LESSON_SUMMARY_KEYS = [
  "id", "title", "week", "day", "skill_type", "tags", "vocab_categories", "difficulty",
  "prerequisites", "estimated_minutes", "status", "vocab_count", "pattern_count",
  "span_count", "character_count", "has_audio_content",
] as const;

function lessonList(): Record<string, unknown>[] {
  return CONTENT.lesson_order.map((id) => CONTENT.lessons[id]).filter(Boolean);
}

function vocabList(): Record<string, unknown>[] {
  return Object.values(CONTENT.vocab);
}

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class LocalApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "LocalApiError";
    this.status = status;
    this.body = { detail };
  }
}

// --------------------------------------------------------------------------
// Shared helpers (ports of backend/app/services.py)
// --------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function recordActivity(opts: { minutes?: number; sessions?: number; day?: string }): void {
  const day = opts.day ?? todayIso();
  tx("dailyStreak", (rows) => {
    const row = rows[day] ?? { day, minutes_active: 0, sessions_completed: 0, day_curriculum_index: null };
    row.minutes_active += Math.max(0, opts.minutes ?? 0);
    row.sessions_completed += Math.max(0, opts.sessions ?? 0);
    rows[day] = row;
  });
}

function activeDays(): string[] {
  const rows = get("dailyStreak");
  return Object.values(rows)
    .filter((r) => r.minutes_active > 0 || r.sessions_completed > 0)
    .map((r) => r.day)
    .sort()
    .reverse();
}

/** Current and longest run of consecutive active days. Port of
 * services.streak_lengths. */
function streakLengths(days: string[], today = todayIso()): [number, number] {
  if (days.length === 0) return [0, 0];
  const ordered = Array.from(new Set(days)).sort();

  let longest = 1;
  let run = 1;
  for (let i = 1; i < ordered.length; i++) {
    run = daysBetween(ordered[i - 1], ordered[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const latest = ordered[ordered.length - 1];
  if (daysBetween(latest, today) > 1) return [0, longest];

  let currentRun = 1;
  for (let i = ordered.length - 1; i > 0; i--) {
    if (daysBetween(ordered[i - 1], ordered[i]) === 1) currentRun += 1;
    else break;
  }
  return [currentRun, longest];
}

function ensureVocabRow(vocabId: string): VocabProgressRow {
  return tx("vocabProgress", (rows) => {
    if (!rows[vocabId]) {
      const s = initialState();
      rows[vocabId] = {
        vocab_id: vocabId,
        ease_factor: s.ease_factor,
        interval_days: s.interval_days,
        repetitions: s.repetitions,
        due_date: s.due_date,
        last_reviewed_at: null,
        last_quality: null,
        total_reviews: 0,
        total_correct: 0,
        introduced_at: nowIso(),
      };
    }
    return rows[vocabId];
  });
}

/** Create scheduling rows for any content item that lacks one, like the
 * backend does on startup and content reload. */
function syncVocabRows(): void {
  tx("vocabProgress", (rows) => {
    const today = todayIso();
    for (const id of CONTENT.srs_item_ids) {
      if (!rows[id]) {
        rows[id] = {
          vocab_id: id,
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          due_date: today,
          last_reviewed_at: null,
          last_quality: null,
          total_reviews: 0,
          total_correct: 0,
          introduced_at: nowIso(),
        };
      }
    }
  });
}
let synced = false;
function ensureSynced(): void {
  if (!synced) {
    syncVocabRows();
    synced = true;
  }
}

// --------------------------------------------------------------------------
// Decoration
// --------------------------------------------------------------------------

function dueVocabIds(): Set<string> {
  const today = todayIso();
  const rows = get("vocabProgress");
  return new Set(Object.values(rows).filter((r) => r.due_date <= today).map((r) => r.vocab_id));
}

function decorateLesson(
  lesson: Record<string, unknown>,
  progress: LessonProgressRow | undefined,
  dueIds: Set<string>,
  full: boolean,
): Record<string, unknown> {
  const vocab = (lesson.vocab as { id: string }[] | undefined) ?? [];
  const base: Record<string, unknown> = full ? { ...lesson } : pick(lesson, LESSON_SUMMARY_KEYS);
  base.progress_status = progress?.status ?? "not_started";
  base.times_practiced = progress?.times_practiced ?? 0;
  base.due_vocab_count = vocab.filter((v) => dueIds.has(v.id)).length;
  return base;
}

function pick(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

function markLessonStarted(lessonId: string): LessonProgressRow {
  return tx("lessonProgress", (rows) => {
    let row = rows[lessonId];
    if (!row) {
      row = { lesson_id: lessonId, status: "not_started", first_started_at: null, completed_at: null, times_practiced: 0 };
      rows[lessonId] = row;
    }
    if (row.status === "not_started") {
      row.status = "in_progress";
      row.first_started_at = nowIso();
    }
    return row;
  });
}

// --------------------------------------------------------------------------
// Vocab progress projection
// --------------------------------------------------------------------------

function progressOut(row: VocabProgressRow | undefined, today: string) {
  if (!row) return null;
  return {
    ease_factor: row.ease_factor,
    interval_days: row.interval_days,
    repetitions: row.repetitions,
    due_date: row.due_date,
    last_reviewed_at: row.last_reviewed_at,
    total_reviews: row.total_reviews,
    total_correct: row.total_correct,
    bucket: masteryBucket(row.repetitions, row.interval_days),
    is_due: row.due_date <= today,
  };
}

function vocabItemOut(item: Record<string, unknown>, row: VocabProgressRow | undefined, today: string) {
  return { ...item, progress: progressOut(row, today) };
}

// --------------------------------------------------------------------------
// Router
// --------------------------------------------------------------------------

type Params = Record<string, string | number | boolean | undefined | null>;

export async function localRequest<T>(
  method: string,
  path: string,
  params: Params | undefined,
  body: unknown,
): Promise<T> {
  ensureSynced();
  const p = params ?? {};
  const segments = path.replace(/^\//, "").split("/").map(decodeURIComponent);
  const result = route(method.toUpperCase(), segments, p, body);
  return result as T;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function route(method: string, seg: string[], p: Params, body: unknown): unknown {
  const [head] = seg;

  // ---- lessons ----
  if (head === "lessons") {
    if (method === "GET" && seg.length === 1) {
      const dueIds = dueVocabIds();
      const lp = get("lessonProgress");
      return lessonList()
        .filter((l) => {
          if (p.week != null && l.week !== num(p.week, -1)) return false;
          if (p.skill_type != null && l.skill_type !== p.skill_type) return false;
          if (p.status != null && l.status !== p.status) return false;
          if (p.has_audio != null && l.has_audio_content !== (String(p.has_audio) === "true")) return false;
          return true;
        })
        .map((l) => decorateLesson(l, lp[l.id as string], dueIds, false));
    }
    if (method === "GET" && seg.length === 2) {
      const lesson = CONTENT.lessons[seg[1]];
      if (!lesson) throw new LocalApiError(404, `No lesson with id '${seg[1]}'`);
      const progress = markLessonStarted(seg[1]);
      return decorateLesson(lesson, progress, dueVocabIds(), true);
    }
    if (method === "POST" && seg.length === 3 && seg[2] === "complete") {
      const lesson = CONTENT.lessons[seg[1]];
      if (!lesson) throw new LocalApiError(404, `No lesson with id '${seg[1]}'`);
      const progress = tx("lessonProgress", (rows) => {
        let row = rows[seg[1]];
        if (!row) {
          row = { lesson_id: seg[1], status: "not_started", first_started_at: null, completed_at: null, times_practiced: 0 };
          rows[seg[1]] = row;
        }
        row.status = "completed";
        row.completed_at = nowIso();
        row.times_practiced += 1;
        if (!row.first_started_at) row.first_started_at = row.completed_at;
        return row;
      });
      const minutes = num(p.minutes, 0);
      if (minutes) recordActivity({ minutes });
      return decorateLesson(lesson, progress, dueVocabIds(), false);
    }
  }

  // ---- vocab ----
  if (head === "vocab") {
    const today = todayIso();
    if (method === "GET" && seg.length === 1) {
      const limit = num(p.limit, 1000);
      const rows = get("vocabProgress");
      const out: unknown[] = [];
      for (const item of vocabList()) {
        if (p.category != null && item.category !== p.category) continue;
        if (p.lesson_id != null && item.source_lesson_id !== p.lesson_id) continue;
        if (p.introduced_week != null && item.introduced_week !== num(p.introduced_week, -1)) continue;
        const row = rows[item.id as string];
        const prog = progressOut(row, today);
        if (p.bucket != null && (!prog || prog.bucket !== p.bucket)) continue;
        out.push({ ...item, progress: prog });
        if (out.length >= limit) break;
      }
      return out;
    }
    if (method === "GET" && seg.length === 2 && seg[1] === "due") {
      const limit = num(p.limit, 30);
      const rows = Object.values(get("vocabProgress"))
        .filter((r) => r.due_date <= today)
        .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.ease_factor - b.ease_factor));
      const out: unknown[] = [];
      for (const row of rows) {
        const item = CONTENT.vocab[row.vocab_id];
        if (!item) continue;
        if (p.category != null && item.category !== p.category) continue;
        if (p.lesson_id != null && item.source_lesson_id !== p.lesson_id) continue;
        out.push(vocabItemOut(item, row, today));
        if (out.length >= limit) break;
      }
      return out;
    }
    if (method === "GET" && seg.length >= 2) {
      const vocabId = seg.slice(1).join("/");
      const item = CONTENT.vocab[vocabId];
      if (!item) throw new LocalApiError(404, `No vocabulary item '${vocabId}'`);
      return vocabItemOut(item, get("vocabProgress")[vocabId], today);
    }
  }

  // ---- sessions ----
  if (head === "sessions") {
    if (method === "POST" && seg[1] === "start") {
      return startSession(body as SessionStartBody);
    }
    if (method === "POST" && seg.length === 3 && seg[2] === "answer") {
      return submitAnswer(num(seg[1], -1), body as AnswerBody);
    }
    if (method === "POST" && seg.length === 3 && seg[2] === "finish") {
      return finishSession(num(seg[1], -1), p.duration_seconds == null ? undefined : num(p.duration_seconds, 0));
    }
    if (method === "GET" && seg.length === 1) {
      const limit = num(p.limit, 20);
      let rows = [...get("gameSessions")].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
      if (p.game_mode) rows = rows.filter((r) => r.game_mode === p.game_mode);
      return rows.slice(0, limit).map(sessionOut);
    }
    if (method === "GET" && seg.length === 2) {
      const session = get("gameSessions").find((s) => s.id === num(seg[1], -1));
      if (!session) throw new LocalApiError(404, `No game session ${seg[1]}`);
      const items = get("gameSessionItems")
        .filter((i) => i.session_id === session.id)
        .sort((a, b) => a.id - b.id)
        .map((i) => ({
          item_ref: i.item_ref,
          was_correct: i.was_correct,
          user_answer: i.user_answer,
          response_time_ms: i.response_time_ms,
          answered_at: i.answered_at,
        }));
      return { ...sessionOut(session), items };
    }
  }

  // ---- progress ----
  if (head === "progress") {
    if (method === "GET" && seg[1] === "summary") return progressSummary();
    if (method === "GET" && seg[1] === "streak") return streakCalendar(num(p.days, 56));
    if (method === "GET" && seg[1] === "vocab-mastery") return vocabMastery();
    if (method === "GET" && seg[1] === "game-modes") return gameModeStats();
    if (method === "GET" && seg[1] === "weakest") return weakestItems(num(p.limit, 20));
    if (method === "GET" && seg[1] === "listening") return listeningStats();
    if (method === "POST" && seg[1] === "audio") return syncAudio(body as AudioBody);
    if (method === "GET" && seg[1] === "curriculum") return PHASES;
  }

  // ---- content ----
  if (head === "content" && seg[1] === "errors" && method === "GET") return CONTENT.errors;

  // ---- settings ----
  if (head === "settings") {
    if (method === "GET") return get("userSettings");
    if (method === "PUT") {
      const values = ((body as { values?: Record<string, string> })?.values) ?? {};
      return tx("userSettings", (store) => {
        for (const [k, v] of Object.entries(values)) store[k] = v;
        return { ...store };
      });
    }
  }

  // ---- meta ----
  if (head === "health") {
    return {
      status: "ok",
      lessons: Object.keys(CONTENT.lessons).length,
      vocab: Object.keys(CONTENT.vocab).length,
      characters: Object.keys(CONTENT.characters).length,
      content_errors: CONTENT.errors.length,
    };
  }

  throw new LocalApiError(404, `No route for ${method} /${seg.join("/")}`);
}

// --------------------------------------------------------------------------
// Sessions
// --------------------------------------------------------------------------

interface SessionStartBody {
  game_mode: string;
  lesson_id?: string | null;
  client_session_key?: string | null;
}
interface AnswerBody {
  item_ref: string;
  was_correct: boolean;
  quality?: number | null;
  response_time_ms?: number | null;
  user_answer?: string | null;
  client_answer_key?: string | null;
}
interface AudioBody {
  lesson_id: string;
  span_ids_listened?: string[];
  seconds_listened?: number;
  completed?: boolean;
}

function sessionOut(s: GameSessionRow) {
  return {
    id: s.id,
    game_mode: s.game_mode,
    lesson_id: s.lesson_id,
    started_at: s.started_at,
    completed_at: s.completed_at,
    score: s.score,
    total_items: s.total_items,
    correct_items: s.correct_items,
    duration_seconds: s.duration_seconds,
  };
}

function startSession(payload: SessionStartBody) {
  if (payload.client_session_key) {
    const existing = get("gameSessions").find(
      (s) => s.client_session_key === payload.client_session_key && s.completed_at === null,
    );
    if (existing) {
      const answered = get("gameSessionItems")
        .filter((i) => i.session_id === existing.id)
        .map((i) => i.item_ref);
      return {
        session_id: existing.id,
        game_mode: existing.game_mode,
        lesson_id: existing.lesson_id,
        resumed: true,
        answered_item_refs: answered,
      };
    }
  }

  const id = nextId("gameSessions");
  const row: GameSessionRow = {
    id,
    game_mode: payload.game_mode,
    lesson_id: payload.lesson_id ?? null,
    client_session_key: payload.client_session_key ?? null,
    started_at: nowIso(),
    completed_at: null,
    score: null,
    total_items: 0,
    correct_items: 0,
    duration_seconds: null,
  };
  tx("gameSessions", (rows) => rows.push(row));
  return { session_id: id, game_mode: row.game_mode, lesson_id: row.lesson_id, resumed: false, answered_item_refs: [] };
}

function submitAnswer(sessionId: number, payload: AnswerBody) {
  const session = get("gameSessions").find((s) => s.id === sessionId);
  if (!session) throw new LocalApiError(404, `No game session ${sessionId}`);

  if (payload.client_answer_key) {
    const dup = get("gameSessionItems").some(
      (i) => i.session_id === sessionId && i.client_answer_key === payload.client_answer_key,
    );
    if (dup) return { recorded: true, duplicate: true, srs_applied: false, next_due_date: null, next_interval_days: null, ease_factor: null };
  }

  tx("gameSessionItems", (rows) => {
    rows.push({
      id: nextId("gameSessionItems"),
      session_id: sessionId,
      item_ref: payload.item_ref,
      was_correct: payload.was_correct,
      response_time_ms: payload.response_time_ms ?? null,
      user_answer: payload.user_answer ?? null,
      answered_at: nowIso(),
      client_answer_key: payload.client_answer_key ?? null,
    });
  });
  tx("gameSessions", (rows) => {
    const s = rows.find((r) => r.id === sessionId)!;
    s.total_items += 1;
    if (payload.was_correct) s.correct_items += 1;
  });

  const isSrsItem = payload.item_ref in CONTENT.vocab || payload.item_ref in CONTENT.characters;
  if (!isSrsItem) {
    return { recorded: true, duplicate: false, srs_applied: false, next_due_date: null, next_interval_days: null, ease_factor: null };
  }

  ensureVocabRow(payload.item_ref);
  const quality = payload.quality ?? gradeFromCorrectness(payload.was_correct, payload.response_time_ms);

  const updated = tx("vocabProgress", (rows) => {
    const row = rows[payload.item_ref];
    const next = nextState(
      { ease_factor: row.ease_factor, interval_days: row.interval_days, repetitions: row.repetitions, due_date: row.due_date },
      quality,
    );
    row.ease_factor = next.ease_factor;
    row.interval_days = next.interval_days;
    row.repetitions = next.repetitions;
    row.due_date = next.due_date;
    row.last_reviewed_at = nowIso();
    row.last_quality = quality;
    row.total_reviews += 1;
    if (payload.was_correct) row.total_correct += 1;
    return next;
  });

  tx("reviewLog", (rows) => {
    rows.push({
      vocab_id: payload.item_ref,
      reviewed_at: nowIso(),
      quality,
      game_mode: session.game_mode,
      response_time_ms: payload.response_time_ms ?? null,
    });
  });

  return {
    recorded: true,
    duplicate: false,
    srs_applied: true,
    next_due_date: updated.due_date,
    next_interval_days: updated.interval_days,
    ease_factor: updated.ease_factor,
  };
}

function finishSession(sessionId: number, durationSeconds: number | undefined) {
  const items = get("gameSessionItems").filter((i) => i.session_id === sessionId);
  const total = items.length;
  const correct = items.filter((i) => i.was_correct).length;

  const outcome = tx("gameSessions", (rows) => {
    const s = rows.find((r) => r.id === sessionId);
    if (!s) throw new LocalApiError(404, `No game session ${sessionId}`);
    const now = Date.now();
    let dur = durationSeconds;
    if (dur == null) dur = Math.max(0, Math.round((now - new Date(s.started_at).getTime()) / 1000));
    const alreadyFinished = s.completed_at !== null;
    s.total_items = total;
    s.correct_items = correct;
    s.score = total ? correct / total : null;
    s.duration_seconds = dur;
    s.completed_at = new Date(now).toISOString();
    return { alreadyFinished, dur, score: s.score };
  });

  if (!outcome.alreadyFinished) {
    recordActivity({ minutes: Math.round(outcome.dur / 60), sessions: 1 });
  }

  const [currentStreak] = streakLengths(activeDays());
  return {
    session_id: sessionId,
    score: outcome.score,
    total_items: total,
    correct_items: correct,
    duration_seconds: outcome.dur,
    streak_days: currentStreak,
  };
}

// --------------------------------------------------------------------------
// Progress
// --------------------------------------------------------------------------

const SECONDS_PER_SPAN_ESTIMATE = 5;

function progressSummary() {
  const today = todayIso();
  const days = activeDays();
  const [streak, longest] = streakLengths(days, today);
  const practicedToday = days.includes(today);
  const todayRow = get("dailyStreak")[today];

  const vocabRows = get("vocabProgress");
  const knownIds = new Set(Object.keys(CONTENT.vocab));
  const relevant = Object.values(vocabRows).filter((r) => knownIds.has(r.vocab_id));
  const dueCount = relevant.filter((r) => r.due_date <= today).length;
  const introduced = relevant.filter((r) => r.repetitions > 0).length;

  const lessonRows = get("lessonProgress");
  const realLessons = lessonList().filter((l) => l.status !== "stub");
  const completed = realLessons.filter((l) => lessonRows[l.id as string]?.status === "completed").length;

  const dayIndex = currentDay(days.length, practicedToday);
  const phase = phaseForDay(dayIndex);

  const weekStart = addDays(today, -mondayOffset(today));
  const sessionsThisWeek = get("gameSessions").filter(
    (s) => s.completed_at !== null && s.started_at.slice(0, 10) >= weekStart,
  ).length;

  return {
    streak_days: streak,
    longest_streak_days: longest,
    practiced_today: practicedToday,
    minutes_today: todayRow?.minutes_active ?? 0,
    sessions_today: todayRow?.sessions_completed ?? 0,
    vocab_due_count: dueCount,
    vocab_total: knownIds.size,
    vocab_introduced: introduced,
    lessons_completed: completed,
    lessons_total: Object.keys(CONTENT.lessons).length,
    lessons_with_content: realLessons.length,
    curriculum_day: dayIndex,
    curriculum_week: weekForDay(dayIndex),
    week_focus: phase.focus,
    sessions_this_week: sessionsThisWeek,
    content_is_placeholder: !CONTENT.has_real_content,
  };
}

function mondayOffset(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 Sun .. 6 Sat
  return (dow + 6) % 7;
}

function streakCalendar(days: number) {
  const today = todayIso();
  const start = addDays(today, -(days - 1));
  const rows = get("dailyStreak");
  const out: DailyStreakRow[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const row = rows[day];
    out.push({
      day,
      minutes_active: row?.minutes_active ?? 0,
      sessions_completed: row?.sessions_completed ?? 0,
      day_curriculum_index: row?.day_curriculum_index ?? null,
    });
  }
  // StreakDay uses `date`, not `day`.
  return out.map((r) => ({
    date: r.day,
    minutes_active: r.minutes_active,
    sessions_completed: r.sessions_completed,
    day_curriculum_index: r.day_curriculum_index,
  }));
}

const CATEGORIES = ["people", "food", "places", "time", "feelings", "verbs", "questions", "social"] as const;

function vocabMastery() {
  const rows = get("vocabProgress");
  const buckets: Record<string, { new: number; learning: number; young: number; mature: number }> = {};
  for (const c of CATEGORIES) buckets[c] = { new: 0, learning: 0, young: 0, mature: 0 };

  for (const item of vocabList()) {
    const row = rows[item.id as string];
    const b = row ? masteryBucket(row.repetitions, row.interval_days) : "new";
    buckets[item.category as string][b] += 1;
  }

  const categories = CATEGORIES.map((category) => {
    const c = buckets[category];
    return { category, new: c.new, learning: c.learning, young: c.young, mature: c.mature, total: c.new + c.learning + c.young + c.mature };
  });

  const totals = {
    category: "people" as const,
    new: sum(categories, "new"),
    learning: sum(categories, "learning"),
    young: sum(categories, "young"),
    mature: sum(categories, "mature"),
    total: sum(categories, "total"),
  };

  const days = activeDays();
  const dayIndex = currentDay(days.length, days.includes(todayIso()));
  const phase = phaseForDay(dayIndex);

  return {
    categories,
    totals,
    milestone_target: phase.vocab_target,
    milestone_label: `${phase.label}: ${phase.vocab_target} words`,
  };
}

function sum<T extends Record<K, number>, K extends string>(arr: T[], key: K): number {
  return arr.reduce((acc, x) => acc + x[key], 0);
}

function gameModeStats() {
  const grouped: Record<string, { sessions: number; items: number; correct: number; last: string | null }> = {};
  for (const s of get("gameSessions")) {
    if (s.completed_at === null) continue;
    const e = (grouped[s.game_mode] ??= { sessions: 0, items: 0, correct: 0, last: null });
    e.sessions += 1;
    e.items += s.total_items;
    e.correct += s.correct_items;
    if (e.last === null || (s.completed_at && s.completed_at > e.last)) e.last = s.completed_at;
  }
  return Object.entries(grouped)
    .map(([game_mode, e]) => ({
      game_mode,
      sessions: e.sessions,
      items: e.items,
      correct: e.correct,
      accuracy: e.items ? e.correct / e.items : null,
      last_played_at: e.last,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

function weakestItems(limit: number) {
  const rows = Object.values(get("vocabProgress"))
    .filter((r) => r.total_reviews > 0)
    .sort((a, b) => a.ease_factor - b.ease_factor || (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  const out: unknown[] = [];
  for (const row of rows) {
    const item = CONTENT.vocab[row.vocab_id];
    if (!item) continue;
    out.push({
      vocab_id: row.vocab_id,
      devanagari: item.devanagari,
      romanized: item.romanized,
      english: item.english,
      category: item.category,
      ease_factor: row.ease_factor,
      total_reviews: row.total_reviews,
      total_correct: row.total_correct,
      accuracy: row.total_reviews ? row.total_correct / row.total_reviews : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function listeningStats() {
  const rows = Object.values(get("audioProgress"));
  const spans = rows.reduce((a, r) => a + r.spans_listened, 0);
  let seconds = rows.reduce((a, r) => a + r.seconds_listened, 0);
  if (seconds === 0) seconds = spans * SECONDS_PER_SPAN_ESTIMATE;
  return {
    spans_listened: spans,
    minutes_listened: Math.round(seconds / 60),
    passages_completed: rows.filter((r) => r.completed).length,
    lessons_with_audio_progress: rows.length,
  };
}

function syncAudio(payload: AudioBody) {
  tx("audioProgress", (rows) => {
    const existing: AudioProgressRow = rows[payload.lesson_id] ?? {
      lesson_id: payload.lesson_id,
      spans_listened: 0,
      span_ids: [],
      seconds_listened: 0,
      completed: false,
      updated_at: nowIso(),
    };
    const merged = Array.from(new Set([...existing.span_ids, ...(payload.span_ids_listened ?? [])])).sort();
    existing.span_ids = merged;
    existing.spans_listened = merged.length;
    existing.seconds_listened = Math.max(existing.seconds_listened, payload.seconds_listened ?? 0);
    existing.completed = existing.completed || !!payload.completed;
    existing.updated_at = nowIso();
    rows[payload.lesson_id] = existing;
  });
  return listeningStats();
}
