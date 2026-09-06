/**
 * Whole-app export/import. There is no server: local/db.ts (SRS, sessions,
 * streaks, lesson progress) and persistence/ (resume state) are the entire
 * durable record, so a cleared browser or a new device otherwise means
 * losing everything with no way back. This is that way back.
 */

export interface BackupFile {
  version: 1;
  exportedAt: string;
  /** Raw localStorage key -> raw JSON string, so import needs no knowledge of
   * individual record shapes and stays correct as they evolve. */
  entries: Record<string, string>;
}

/** Both localStorage prefixes worth carrying: local/db.ts's "database" tables
 * and persistence/'s resume state. Deliberately excludes anything else that
 * might live in localStorage (e.g. a future unrelated key) from either
 * export or import. */
const BACKUP_PREFIXES = ["nepali:db:v1:", "nepali:v1:"];

export function exportBackup(): BackupFile {
  const entries: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !BACKUP_PREFIXES.some((p) => key.startsWith(p))) continue;
    const value = window.localStorage.getItem(key);
    if (value != null) entries[key] = value;
  }
  return { version: 1, exportedAt: new Date().toISOString(), entries };
}

export function downloadBackup(): void {
  const backup = exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nepali-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export class BackupImportError extends Error {}

function isBackupFile(value: unknown): value is BackupFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as BackupFile).version === 1 &&
    typeof (value as BackupFile).entries === "object" &&
    (value as BackupFile).entries !== null
  );
}

/** Restores every entry from a backup, overwriting whatever is currently
 * stored under the same keys. Entries outside the known prefixes are ignored
 * rather than rejected, so an otherwise-valid file from a slightly newer
 * version of the app still imports. */
export function importBackup(raw: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupImportError("That file isn't valid JSON.");
  }
  if (!isBackupFile(parsed)) {
    throw new BackupImportError("That doesn't look like a Nepali Trainer progress backup.");
  }

  let restored = 0;
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (!BACKUP_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (typeof value !== "string") continue;
    window.localStorage.setItem(key, value);
    restored += 1;
  }
  return restored;
}
