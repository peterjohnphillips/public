/**
 * Thin, safe wrapper around window.localStorage. Not a state library: it just
 * makes every read and write crash-proof, since a private window, blocked
 * site data, or a storage quota can make localStorage throw rather than
 * return null, and the app must render correctly with nothing stored.
 */

function isQuotaOrAccessError(error: unknown): boolean {
  return error instanceof DOMException || error instanceof Error;
}

export function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    if (!isQuotaOrAccessError(error)) throw error;
    return null;
  }
}

/** Reads a record and discards it if its stored `version` doesn't match -
 * the documented policy for every shape in persistence/schema.ts is to
 * throw away a stale format rather than migrate it, since everything kept
 * here is resume/presentation state, not the durable record. */
export function readVersioned<T extends { version: number }>(key: string, version: T["version"]): T | null {
  const record = readJSON<T>(key);
  if (!record || record.version !== version) return null;
  return record;
}

let writeFailed = false;

/** True once a write to local storage has failed - a persistent quota/access
 * error means whatever this call was trying to save (an answer, a streak,
 * SRS state) is silently gone, and there is no server copy to fall back on. */
export function hasStorageWriteFailed(): boolean {
  return writeFailed;
}

export function writeJSON<T>(key: string, value: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (!isQuotaOrAccessError(error)) throw error;
    writeFailed = true;
    return false;
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is inaccessible.
  }
}

export function listKeys(prefix: string): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

/** Debounces writes so per-span audio updates and per-keystroke game state
 * do not thrash the main thread. One timer per key. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function writeJSONDebounced<T>(key: string, value: T, delayMs = 300): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      writeJSON(key, value);
      debounceTimers.delete(key);
    }, delayMs),
  );
}

/** Forces any pending debounced write for a key out immediately. Call this
 * before navigating away or finishing a flow that a debounce might otherwise
 * still be waiting to flush. */
export function flushDebounced<T>(key: string, value: T): void {
  const existing = debounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    debounceTimers.delete(key);
  }
  writeJSON(key, value);
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
