import { readJSON, remove, writeJSON } from "./localStore";
import { STORAGE_KEYS, type DailySessionRecord } from "./schema";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readDailySession(): DailySessionRecord | null {
  const record = readJSON<DailySessionRecord>(STORAGE_KEYS.dailySession);
  if (!record || record.dateKey !== todayKey()) return null;
  return record;
}

export function startDailySession(totalActivities: number): DailySessionRecord {
  const record: DailySessionRecord = {
    version: 1,
    dateKey: todayKey(),
    activityIndex: 0,
    totalActivities,
    updatedAt: new Date().toISOString(),
  };
  writeJSON(STORAGE_KEYS.dailySession, record);
  return record;
}

export function advanceDailySession(): DailySessionRecord | null {
  const record = readDailySession();
  if (!record) return null;
  record.activityIndex = Math.min(record.activityIndex + 1, record.totalActivities);
  record.updatedAt = new Date().toISOString();
  writeJSON(STORAGE_KEYS.dailySession, record);
  return record;
}

export function clearDailySession(): void {
  remove(STORAGE_KEYS.dailySession);
}
