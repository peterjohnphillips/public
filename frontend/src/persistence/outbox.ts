/**
 * Answers and finished sessions that failed to reach the backend, replayed on
 * the next successful request and on regaining focus. This is what lets
 * offline practice still count once the connection (or the backend process
 * itself) comes back.
 *
 * Replay is safe to retry blindly: every answer carries a client_answer_key
 * and every session start carries a client_session_key, and the backend
 * de-duplicates on both, so a flush that partially succeeds and gets retried
 * cannot double-count a review.
 */

import { readJSON, writeJSON } from "./localStore";
import { STORAGE_KEYS, type OutboxEntry, type OutboxRecord } from "./schema";
import { api } from "../api/client";

function readOutbox(): OutboxRecord {
  return readJSON<OutboxRecord>(STORAGE_KEYS.outbox) ?? { version: 1, entries: [] };
}

function writeOutbox(record: OutboxRecord): void {
  writeJSON(STORAGE_KEYS.outbox, record);
}

export function enqueue(entry: OutboxEntry): void {
  const record = readOutbox();
  record.entries.push(entry);
  writeOutbox(record);
}

export function outboxSize(): number {
  return readOutbox().entries.length;
}

let flushing = false;

/** Attempts to send every queued entry, in order, removing each on success and
 * stopping at the first failure (later entries for the same session likely
 * depend on it, e.g. a finish after an answer). Safe to call speculatively -
 * it no-ops when the queue is empty or a flush is already running. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  const record = readOutbox();
  if (record.entries.length === 0) return;

  flushing = true;
  try {
    const remaining = [...record.entries];
    while (remaining.length > 0) {
      const entry = remaining[0];
      try {
        if (entry.kind === "answer") {
          await api.post(`/sessions/${entry.sessionId}/answer`, entry.payload);
        } else {
          await api.post(`/sessions/${entry.sessionId}/finish`, undefined, {
            duration_seconds: entry.duration_seconds,
          });
        }
        remaining.shift();
        writeOutbox({ version: 1, entries: remaining });
      } catch {
        // Stop here; the rest retry on the next flush attempt.
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

export function startOutboxFlusher(): () => void {
  const onFocus = () => void flushOutbox();
  const onOnline = () => void flushOutbox();
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  void flushOutbox();
  return () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
  };
}
