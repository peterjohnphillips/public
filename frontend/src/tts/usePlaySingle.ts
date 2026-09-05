/**
 * A lighter-weight sibling of useTts for games that only need to play one
 * phrase on demand (listening comprehension, transcription) rather than a
 * whole lesson passage with highlight-sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { TtsEngine } from "./ttsEngine";
import { useSettings } from "../persistence/settingsStore";

export function usePlaySingle() {
  const [settings] = useSettings();
  const engineRef = useRef<TtsEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  useEffect(() => {
    const engine = new TtsEngine({
      onPlayStateChange: setIsPlaying,
      onVoicesReady: ({ nepaliAvailable }) => setVoiceAvailable(nepaliAvailable),
    });
    engineRef.current = engine;
    void engine.init();
    return () => engine.dispose();
  }, []);

  const play = useCallback(
    (devanagari: string, romanized: string, rateOverride?: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.speakQueue(
        [{ turnIndex: 0, spanIndex: 0, speaker: null, devanagari, romanized, english: "" }],
        {
          rate: rateOverride ?? settings.rate,
          voiceURI: settings.voiceURI,
          useFallbackVoice: settings.useFallbackVoice || !voiceAvailable,
          interSentencePauseMs: 0,
        },
      );
    },
    [settings.rate, settings.voiceURI, settings.useFallbackVoice, voiceAvailable],
  );

  const stop = useCallback(() => engineRef.current?.stop(), []);

  return { play, stop, isPlaying, voiceAvailable };
}
