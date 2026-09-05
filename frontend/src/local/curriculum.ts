/** The four-week plan, ported from backend/app/curriculum.py. */

export interface Phase {
  key: string;
  label: string;
  focus: string;
  first_day: number;
  last_day: number;
  vocab_target: number;
  daily_minutes: number;
}

export const PHASES: Phase[] = [
  { key: "days-1-3", label: "Days 1-3", focus: "Pronunciation, survival phrases, 100 core words", first_day: 1, last_day: 3, vocab_target: 100, daily_minutes: 165 },
  { key: "days-4-7", label: "Days 4-7", focus: "Basic sentence construction, ~300 words", first_day: 4, last_day: 7, vocab_target: 300, daily_minutes: 165 },
  { key: "week-2", label: "Week 2", focus: "Conversation patterns, ~600 words", first_day: 8, last_day: 14, vocab_target: 600, daily_minutes: 165 },
  { key: "week-3", label: "Week 3", focus: "Speaking almost entirely in Nepali, ~900 words", first_day: 15, last_day: 21, vocab_target: 900, daily_minutes: 165 },
  { key: "week-4", label: "Week 4", focus: "Fluency drilling, listening, correction", first_day: 22, last_day: 28, vocab_target: 900, daily_minutes: 165 },
];

export const TOTAL_DAYS = 28;

export function clampDay(day: number): number {
  return Math.max(1, Math.min(TOTAL_DAYS, day));
}

export function phaseForDay(day: number): Phase {
  const d = clampDay(day);
  return PHASES.find((p) => p.first_day <= d && d <= p.last_day) ?? PHASES[PHASES.length - 1];
}

export function weekForDay(day: number): number {
  return Math.floor((clampDay(day) - 1) / 7) + 1;
}

export function currentDay(daysPracticed: number, practicedToday: boolean): number {
  if (daysPracticed <= 0) return 1;
  return clampDay(practicedToday ? daysPracticed : daysPracticed + 1);
}
