import { useEffect, useState } from "react";
import { readJSON, writeJSON } from "./localStore";
import { DEFAULT_SETTINGS, STORAGE_KEYS, type SettingsRecord } from "./schema";
import { api } from "../api/client";

export function readSettings(): SettingsRecord {
  const stored = readJSON<SettingsRecord>(STORAGE_KEYS.settings);
  if (stored?.version === 1) return { ...DEFAULT_SETTINGS, ...stored };
  return DEFAULT_SETTINGS;
}

function writeSettings(settings: SettingsRecord): void {
  writeJSON(STORAGE_KEYS.settings, settings);
}

/** Mirrors a changed setting to the backend's UserSettings table so a second
 * device inherits it. Local storage remains authoritative for this session;
 * this is fire-and-forget and never blocks the UI on network state. */
function syncToBackend(patch: Partial<Record<string, string>>): void {
  api.put("/settings", { values: patch }).catch(() => {
    // Backend unreachable is fine here: local storage already has the change,
    // and the next successful sync will carry it.
  });
}

let listeners: Array<() => void> = [];
function notify() {
  listeners.forEach((fn) => fn());
}

export function useSettings(): [SettingsRecord, (patch: Partial<SettingsRecord>) => void] {
  const [settings, setSettings] = useState<SettingsRecord>(readSettings);

  useEffect(() => {
    const listener = () => setSettings(readSettings());
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const update = (patch: Partial<SettingsRecord>) => {
    const next = { ...readSettings(), ...patch };
    writeSettings(next);
    notify();

    const backendPatch: Record<string, string> = {};
    if (patch.voiceURI !== undefined) backendPatch.voiceURI = patch.voiceURI ?? "";
    if (patch.rate !== undefined) backendPatch.rate = String(patch.rate);
    if (patch.promptDirection !== undefined) backendPatch.promptDirection = patch.promptDirection;
    if (patch.theme !== undefined) backendPatch.theme = patch.theme;
    if (Object.keys(backendPatch).length > 0) syncToBackend(backendPatch);
  };

  return [settings, update];
}
