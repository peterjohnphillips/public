/**
 * Per-lesson playback position, written on every span boundary by the TTS
 * engine's onSpanStart callback. This is what makes resume exact rather than
 * approximate, and what turns "listened" into a real percentage rather than a
 * binary flag.
 */

import { flushDebounced, listKeys, readJSON, remove, writeJSONDebounced } from "./localStore";
import { STORAGE_KEYS, type AudioRecord } from "./schema";
import { api } from "../api/client";

export function readAudioRecord(lessonId: string): AudioRecord | null {
  return readJSON<AudioRecord>(STORAGE_KEYS.audio(lessonId));
}

export function writeAudioRecord(record: AudioRecord, opts: { immediate?: boolean } = {}): void {
  const key = STORAGE_KEYS.audio(record.lessonId);
  if (opts.immediate) {
    flushDebounced(key, record);
  } else {
    writeJSONDebounced(key, record);
  }
}

export function clearAudioRecord(lessonId: string): void {
  remove(STORAGE_KEYS.audio(lessonId));
}

export function allAudioLessonIds(): string[] {
  const prefix = STORAGE_KEYS.audio("");
  return listKeys(prefix).map((key) => key.slice(prefix.length));
}

/** Rolls the listened-span set up to the backend so listening minutes survive
 * a cleared browser. Best-effort: local storage is already the source of
 * truth for the live UI, so a failed sync just gets retried on the next call. */
export function syncAudioToBackend(record: AudioRecord): void {
  api
    .post("/progress/audio", {
      lesson_id: record.lessonId,
      span_ids_listened: record.listenedSpanIds,
      seconds_listened: 0, // spans_listened is the reliable signal; see backend estimate.
      completed: record.isComplete,
    })
    .catch(() => {
      // Retried implicitly next time a span boundary triggers a sync.
    });
}
