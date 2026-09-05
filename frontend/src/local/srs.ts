/**
 * SM-2-lite scheduling, ported verbatim from backend/app/srs/scheduler.py so
 * the static build schedules reviews identically to the full-stack app.
 */

export const MIN_EASE_FACTOR = 1.3;
export const DEFAULT_EASE_FACTOR = 2.5;
export const PASS_THRESHOLD = 3;

const LEARNING_MAX_INTERVAL = 1;
const YOUNG_MAX_INTERVAL = 21;

export interface SrsState {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string; // ISO date (YYYY-MM-DD)
}

/** Local calendar date as YYYY-MM-DD, matching Python's date.today(). */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Whole days from `a` to `b` (b - a). Both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function gradeFromCorrectness(
  wasCorrect: boolean,
  responseTimeMs: number | null | undefined,
  fastThresholdMs = 4000,
): number {
  if (!wasCorrect) return 1;
  if (responseTimeMs != null && responseTimeMs <= fastThresholdMs) return 5;
  return 4;
}

export function nextState(current: SrsState, quality: number, today = todayIso()): SrsState {
  if (quality < 0 || quality > 5) throw new Error(`quality must be between 0 and 5, got ${quality}`);

  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const easeFactor = Math.max(MIN_EASE_FACTOR, current.ease_factor + delta);

  let repetitions: number;
  let intervalDays: number;
  if (quality < PASS_THRESHOLD) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = current.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(current.interval_days * easeFactor));
  }

  return {
    ease_factor: round4(easeFactor),
    interval_days: intervalDays,
    repetitions,
    due_date: addDays(today, intervalDays),
  };
}

export function initialState(today = todayIso()): SrsState {
  return { ease_factor: DEFAULT_EASE_FACTOR, interval_days: 0, repetitions: 0, due_date: today };
}

export function masteryBucket(repetitions: number, intervalDays: number): "new" | "learning" | "young" | "mature" {
  if (repetitions === 0) return "new";
  if (intervalDays <= LEARNING_MAX_INTERVAL) return "learning";
  if (intervalDays <= YOUNG_MAX_INTERVAL) return "young";
  return "mature";
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
