/**
 * Shapes and versions for everything mirrored into browser local storage.
 *
 * This is presentation/resume state, not the durable record (SQLite is).
 * A version bump on any of these is safe to handle by discarding the old
 * value rather than migrating it, since losing a scroll position or a voice
 * choice is harmless - see persistence/localStore.ts.
 */

export const STORAGE_PREFIX = "nepali:v1:";

export interface AudioRecord {
  version: 1;
  lessonId: string;
  turnIndex: number;
  spanIndex: number;
  rate: number;
  voiceURI: string | null;
  useFallbackVoice: boolean;
  isComplete: boolean;
  listenedSpanIds: string[];
  updatedAt: string; // ISO timestamp
}

export interface InFlightAnswer {
  itemRef: string;
  wasCorrect: boolean;
  quality?: number;
  userAnswer?: string;
  responseTimeMs?: number;
  clientAnswerKey: string;
}

export interface SessionRecord {
  version: 1;
  clientSessionKey: string;
  sessionId: number | null;
  gameMode: string;
  lessonId: string | null;
  questionIndex: number;
  totalQuestions: number;
  answers: InFlightAnswer[];
  correctCount: number;
  startedAt: string;
  updatedAt: string;
}

export interface LessonPositionRecord {
  version: 1;
  lessonId: string;
  /** Topmost section visible when the user last left the page. */
  section: "notes" | "patterns" | "vocab" | "passage" | "practice";
  scrollY: number;
  updatedAt: string;
}

export interface DailySessionRecord {
  version: 1;
  dateKey: string; // YYYY-MM-DD, the day this queue was built for
  activityIndex: number;
  totalActivities: number;
  updatedAt: string;
}

export interface SettingsRecord {
  version: 1;
  voiceURI: string | null;
  useFallbackVoice: boolean;
  rate: number;
  promptDirection: "nepali-to-english" | "english-to-nepali";
  hiddenLines: {
    english: boolean;
    romanized: boolean;
  };
  theme: "system" | "light" | "dark";
}

export interface SnapshotRecord {
  version: 1;
  progressSummary: unknown;
  fetchedAt: string;
}

export const DEFAULT_SETTINGS: SettingsRecord = {
  version: 1,
  voiceURI: null,
  useFallbackVoice: false,
  rate: 0.85,
  promptDirection: "nepali-to-english",
  hiddenLines: { english: false, romanized: false },
  theme: "system",
};

/** Keys are namespaced and versioned so a future format change fails safe. */
export const STORAGE_KEYS = {
  audio: (lessonId: string) => `${STORAGE_PREFIX}audio:${lessonId}`,
  lesson: (lessonId: string) => `${STORAGE_PREFIX}lesson:${lessonId}`,
  session: `${STORAGE_PREFIX}session`,
  dailySession: `${STORAGE_PREFIX}dailySession`,
  settings: `${STORAGE_PREFIX}settings`,
  snapshot: `${STORAGE_PREFIX}snapshot`,
} as const;
