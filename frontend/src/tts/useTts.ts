/**
 * React hook exposing play/pause/stop/progress/highlight-index for a lesson's
 * playback queue, and writing the current position to local storage on every
 * span boundary so a closed tab resumes exactly rather than approximately.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TtsEngine, type CurrentSpan, DEFAULT_INTER_SENTENCE_PAUSE_MS } from "./ttsEngine";
import { buildPlaybackQueue, type PlaybackQueueItem } from "./chunker";
import { readAudioRecord, syncAudioToBackend, writeAudioRecord } from "../persistence/audioStore";
import { useSettings } from "../persistence/settingsStore";
import type { PlaybackUnit } from "../types/content";

export interface UseTtsResult {
  play: (fromSpan?: { turnIndex: number; spanIndex: number }) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isPlaying: boolean;
  currentSpan: CurrentSpan;
  voiceAvailable: boolean;
  voices: SpeechSynthesisVoice[];
  rate: number;
  setRate: (rate: number) => void;
  voiceURI: string | null;
  useFallbackVoice: boolean;
  setVoiceURI: (uri: string | null) => void;
  setUseFallbackVoice: (useFallback: boolean) => void;
  listenedSpanIds: Set<string>;
  progressFraction: number;
}

export function useTts(lessonId: string, turns: PlaybackUnit[]): UseTtsResult {
  const [settings, updateSettings] = useSettings();
  const engineRef = useRef<TtsEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpan, setCurrentSpan] = useState<CurrentSpan>(null);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [listenedSpanIds, setListenedSpanIds] = useState<Set<string>>(() => {
    const record = readAudioRecord(lessonId);
    return new Set(record?.listenedSpanIds ?? []);
  });

  const queue = useMemo<PlaybackQueueItem[]>(() => buildPlaybackQueue(turns), [turns]);
  const totalSpans = useMemo(() => turns.reduce((sum, turn) => sum + turn.spans.length, 0), [turns]);

  useEffect(() => {
    const engine = new TtsEngine({
      onPlayStateChange: setIsPlaying,
      onVoicesReady: ({ nepaliAvailable, voices: list }) => {
        setVoiceAvailable(nepaliAvailable);
        setVoices(list);
        // No Nepali voice on this system: fall back to reading the
        // romanization with an English voice, per the confirmed design.
        if (!nepaliAvailable && !settings.useFallbackVoice) {
          updateSettings({ useFallbackVoice: true });
        }
      },
      onSpanStart: (span, item) => {
        setCurrentSpan(span);
        const spanId = `${lessonId}:${item.turnIndex}:${item.spanIndex}`;
        setListenedSpanIds((prev) => {
          if (prev.has(spanId)) return prev;
          const next = new Set(prev);
          next.add(spanId);
          const record = {
            version: 1 as const,
            lessonId,
            turnIndex: item.turnIndex,
            spanIndex: item.spanIndex,
            rate: settings.rate,
            voiceURI: settings.voiceURI,
            useFallbackVoice: settings.useFallbackVoice,
            isComplete: false,
            listenedSpanIds: Array.from(next),
            updatedAt: new Date().toISOString(),
          };
          writeAudioRecord(record);
          return next;
        });
      },
      onQueueEnd: () => {
        setCurrentSpan(null);
        const record = readAudioRecord(lessonId);
        const completed = {
          version: 1 as const,
          lessonId,
          turnIndex: record?.turnIndex ?? 0,
          spanIndex: record?.spanIndex ?? 0,
          rate: settings.rate,
          voiceURI: settings.voiceURI,
          useFallbackVoice: settings.useFallbackVoice,
          isComplete: true,
          listenedSpanIds: record?.listenedSpanIds ?? [],
          updatedAt: new Date().toISOString(),
        };
        writeAudioRecord(completed, { immediate: true });
        syncAudioToBackend(completed);
      },
    });
    engineRef.current = engine;
    void engine.init();
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine identity only
  }, [lessonId]);

  const play = useCallback(
    (fromSpan?: { turnIndex: number; spanIndex: number }) => {
      const engine = engineRef.current;
      if (!engine || queue.length === 0) return;

      let startIndex = 0;
      if (fromSpan) {
        const found = queue.findIndex(
          (item) => item.turnIndex === fromSpan.turnIndex && item.spanIndex === fromSpan.spanIndex,
        );
        if (found >= 0) startIndex = found;
      }

      engine.speakQueue(
        queue,
        {
          rate: settings.rate,
          voiceURI: settings.voiceURI,
          useFallbackVoice: settings.useFallbackVoice,
          interSentencePauseMs: DEFAULT_INTER_SENTENCE_PAUSE_MS,
        },
        startIndex,
      );
    },
    [queue, settings.rate, settings.voiceURI, settings.useFallbackVoice],
  );

  const stop = useCallback(() => engineRef.current?.stop(), []);
  const pause = useCallback(() => engineRef.current?.pause(), []);
  const resume = useCallback(() => engineRef.current?.resume(), []);

  const setRate = useCallback(
    (rate: number) => updateSettings({ rate }),
    [updateSettings],
  );
  const setVoiceURI = useCallback(
    (uri: string | null) => updateSettings({ voiceURI: uri }),
    [updateSettings],
  );
  const setUseFallbackVoice = useCallback(
    (useFallback: boolean) => updateSettings({ useFallbackVoice: useFallback }),
    [updateSettings],
  );

  return {
    play,
    stop,
    pause,
    resume,
    isPlaying,
    currentSpan,
    voiceAvailable,
    voices,
    rate: settings.rate,
    setRate,
    voiceURI: settings.voiceURI,
    useFallbackVoice: settings.useFallbackVoice,
    setVoiceURI,
    setUseFallbackVoice,
    listenedSpanIds,
    progressFraction: totalSpans > 0 ? listenedSpanIds.size / totalSpans : 0,
  };
}
