/**
 * Resolves what the user should be offered on landing: at most one resume
 * target, so the home page always has one obvious next action rather than a
 * list of stale possibilities.
 *
 * Priority: an in-flight game beats a mid-passage audio position beats a
 * partially-worked daily queue, since finishing a quiz you already started
 * is more valuable than re-hearing a sentence you were only listening to.
 */

import { allAudioLessonIds, readAudioRecord } from "./audioStore";
import { readDailySession } from "./dailySessionStore";
import { isSessionResumable, readSession } from "./sessionStore";
import type { AudioRecord, DailySessionRecord, SessionRecord } from "./schema";

export type ResumeTarget =
  | { kind: "session"; record: SessionRecord }
  | { kind: "audio"; record: AudioRecord }
  | { kind: "daily"; record: DailySessionRecord };

const AUDIO_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

function mostRecentUnfinishedAudio(): AudioRecord | null {
  let best: AudioRecord | null = null;
  for (const lessonId of allAudioLessonIds()) {
    const record = readAudioRecord(lessonId);
    if (!record || record.isComplete) continue;
    const age = Date.now() - new Date(record.updatedAt).getTime();
    if (age >= AUDIO_RESUME_WINDOW_MS) continue;
    if (!best || record.updatedAt > best.updatedAt) best = record;
  }
  return best;
}

export function resolveResumeTarget(): ResumeTarget | null {
  const session = readSession();
  if (session && isSessionResumable(session)) {
    return { kind: "session", record: session };
  }

  const audio = mostRecentUnfinishedAudio();
  if (audio) {
    return { kind: "audio", record: audio };
  }

  const daily = readDailySession();
  if (daily && daily.activityIndex < daily.totalActivities) {
    return { kind: "daily", record: daily };
  }

  return null;
}

export function describeResumeTarget(target: ResumeTarget): string {
  switch (target.kind) {
    case "session": {
      const { record } = target;
      return `Continue ${record.gameMode.replace(/-/g, " ")}, question ${record.questionIndex + 1} of ${record.totalQuestions}`;
    }
    case "audio": {
      const { record } = target;
      return `Resume ${record.lessonId.replace(/-/g, " ")} from where you left off listening`;
    }
    case "daily": {
      const { record } = target;
      return `Continue today's session, activity ${record.activityIndex + 1} of ${record.totalActivities}`;
    }
  }
}
