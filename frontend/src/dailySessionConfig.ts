/**
 * Maps curriculum week-phase to a mix of game modes. A static config table,
 * not backend logic, so the mix is tunable without touching the API - see
 * plan section 9 (Daily Session).
 */

export interface DailyActivity {
  mode: string;
  /** When true, the daily session assembler picks the highest-priority
   * available lesson for this slot (script lesson for character drills, the
   * day's own lesson otherwise) rather than requiring the caller to specify one. */
  lessonHint?: "current-day" | "script" | "none";
}

export interface PhaseSessionConfig {
  phaseKey: string;
  activities: DailyActivity[];
}

export const DAILY_SESSION_CONFIG: PhaseSessionConfig[] = [
  {
    phaseKey: "days-1-3",
    activities: [
      { mode: "character-recognition", lessonHint: "script" },
      { mode: "multiple-choice" },
      { mode: "read-along", lessonHint: "current-day" },
    ],
  },
  {
    phaseKey: "days-4-7",
    activities: [
      { mode: "fill-in-blank", lessonHint: "current-day" },
      { mode: "typing-drill" },
      { mode: "matching-pairs" },
    ],
  },
  {
    phaseKey: "week-2",
    activities: [
      { mode: "sentence-scramble", lessonHint: "current-day" },
      { mode: "sentence-builder", lessonHint: "current-day" },
      { mode: "flashcards" },
    ],
  },
  {
    phaseKey: "week-3",
    activities: [
      { mode: "sentence-builder", lessonHint: "current-day" },
      { mode: "listening-comprehension", lessonHint: "current-day" },
      { mode: "read-along", lessonHint: "current-day" },
    ],
  },
  {
    phaseKey: "week-4",
    activities: [
      { mode: "listening-transcription", lessonHint: "current-day" },
      { mode: "typing-drill" },
      { mode: "flashcards" },
    ],
  },
];

export function activitiesForPhase(phaseKey: string): DailyActivity[] {
  return DAILY_SESSION_CONFIG.find((p) => p.phaseKey === phaseKey)?.activities ?? DAILY_SESSION_CONFIG[0].activities;
}
