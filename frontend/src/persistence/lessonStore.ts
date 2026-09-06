/**
 * Per-lesson scroll position, written as the user scrolls past each section.
 * This is what "resume the lesson I was reading" means today: the app has no
 * multi-step lesson player, just a long scrolling page, so the position
 * within it is the whole of "where I was".
 */

import { listKeys, readVersioned, writeJSONDebounced } from "./localStore";
import { STORAGE_KEYS, type LessonPositionRecord } from "./schema";

export function readLessonPosition(lessonId: string): LessonPositionRecord | null {
  return readVersioned<LessonPositionRecord>(STORAGE_KEYS.lesson(lessonId), 1);
}

export function writeLessonPosition(record: LessonPositionRecord): void {
  writeJSONDebounced(STORAGE_KEYS.lesson(record.lessonId), record);
}

export function allLessonPositionIds(): string[] {
  const prefix = STORAGE_KEYS.lesson("");
  return listKeys(prefix).map((key) => key.slice(prefix.length));
}

/** A position older than this is treated as abandoned rather than resumable -
 * matches the window used for in-flight games and audio playback. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isLessonPositionFresh(record: LessonPositionRecord): boolean {
  return Date.now() - new Date(record.updatedAt).getTime() < RESUME_WINDOW_MS;
}
