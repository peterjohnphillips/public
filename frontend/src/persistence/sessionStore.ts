/**
 * The in-flight game: mode, lesson, question index, answers so far. A page
 * refresh mid-game restores the exact question with the running score intact.
 * Only one game is ever in flight at a time in this app, so there is a single
 * record rather than one per session.
 */

import { newId, readJSON, remove, writeJSON } from "./localStore";
import { STORAGE_KEYS, type InFlightAnswer, type SessionRecord } from "./schema";

export function readSession(): SessionRecord | null {
  return readJSON<SessionRecord>(STORAGE_KEYS.session);
}

export function startNewSession(gameMode: string, lessonId: string | null, totalQuestions: number): SessionRecord {
  const record: SessionRecord = {
    version: 1,
    clientSessionKey: newId(),
    sessionId: null,
    gameMode,
    lessonId,
    questionIndex: 0,
    totalQuestions,
    answers: [],
    correctCount: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeJSON(STORAGE_KEYS.session, record);
  return record;
}

export function attachSessionId(sessionId: number): void {
  const record = readSession();
  if (!record) return;
  record.sessionId = sessionId;
  record.updatedAt = new Date().toISOString();
  writeJSON(STORAGE_KEYS.session, record);
}

export function recordAnswer(answer: InFlightAnswer): SessionRecord | null {
  const record = readSession();
  if (!record) return null;
  record.answers.push(answer);
  if (answer.wasCorrect) record.correctCount += 1;
  record.questionIndex += 1;
  record.updatedAt = new Date().toISOString();
  writeJSON(STORAGE_KEYS.session, record);
  return record;
}

export function clearSession(): void {
  remove(STORAGE_KEYS.session);
}

/** A record older than this is treated as abandoned rather than resumable -
 * offering to continue a quiz from three days ago is more confusing than
 * helpful. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isSessionResumable(record: SessionRecord): boolean {
  const age = Date.now() - new Date(record.updatedAt).getTime();
  return age < RESUME_WINDOW_MS && record.questionIndex < record.totalQuestions;
}
