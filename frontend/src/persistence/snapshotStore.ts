/**
 * The last fetched progress summary, so the dashboard paints streak, due
 * count and mastery figures instantly on load rather than flashing empty
 * while the query resolves.
 */

import { readVersioned, writeJSON } from "./localStore";
import { STORAGE_KEYS, type SnapshotRecord } from "./schema";
import type { ProgressSummary } from "../types/content";

export function readSnapshot(): ProgressSummary | null {
  const record = readVersioned<SnapshotRecord>(STORAGE_KEYS.snapshot, 1);
  return (record?.progressSummary as ProgressSummary | undefined) ?? null;
}

export function writeSnapshot(summary: ProgressSummary): void {
  const record: SnapshotRecord = {
    version: 1,
    progressSummary: summary,
    fetchedAt: new Date().toISOString(),
  };
  writeJSON(STORAGE_KEYS.snapshot, record);
}
