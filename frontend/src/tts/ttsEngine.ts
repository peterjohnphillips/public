/**
 * Wraps window.speechSynthesis as a small state machine.
 *
 * The problem being solved: Chrome truncates a single long utterance after
 * roughly fifteen seconds, and pause/resume behaviour differs across
 * browsers. The fix is to never hand the API more than one sentence: each
 * queue item becomes its own SpeechSynthesisUtterance, and the next one is
 * only created from the previous one's `onend`, which is what avoids the
 * truncation bug entirely (there is never a single long utterance for the
 * browser to give up on).
 *
 * Not React-specific - see useTts.ts for the hook that wraps this for
 * components. Callback-based so it's testable independent of React.
 */

import type { PlaybackQueueItem } from "./chunker";
import { findEnglishVoice, findNepaliVoice, findVoiceByURI, loadVoices } from "./voices";

export type CurrentSpan = { turnIndex: number; spanIndex: number } | null;

export interface TtsEngineCallbacks {
  onSpanStart?: (span: CurrentSpan, item: PlaybackQueueItem) => void;
  onQueueEnd?: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onVoicesReady?: (info: { nepaliAvailable: boolean; voices: SpeechSynthesisVoice[] }) => void;
}

export interface SpeakOptions {
  rate: number;
  voiceURI: string | null;
  useFallbackVoice: boolean;
  interSentencePauseMs: number;
}

export const DEFAULT_RATE = 0.85;
export const FALLBACK_RATE = 0.7;
export const DEFAULT_INTER_SENTENCE_PAUSE_MS = 200;

export class TtsEngine {
  private callbacks: TtsEngineCallbacks;
  private voices: SpeechSynthesisVoice[] = [];
  private queue: PlaybackQueueItem[] = [];
  private index = -1;
  private playing = false;
  private stopped = true;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: TtsEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async init(): Promise<void> {
    this.voices = await loadVoices();
    this.callbacks.onVoicesReady?.({
      nepaliAvailable: findNepaliVoice(this.voices) !== null,
      voices: this.voices,
    });
  }

  get nepaliVoiceAvailable(): boolean {
    return findNepaliVoice(this.voices) !== null;
  }

  get availableVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  private resolveVoice(opts: SpeakOptions): SpeechSynthesisVoice | null {
    if (opts.useFallbackVoice) {
      return findEnglishVoice(this.voices);
    }
    return findVoiceByURI(this.voices, opts.voiceURI) ?? findNepaliVoice(this.voices);
  }

  speakQueue(queue: PlaybackQueueItem[], opts: SpeakOptions, startIndex = 0): void {
    this.cancelNative();
    this.queue = queue;
    this.index = startIndex - 1;
    this.stopped = false;
    this.setPlaying(true);
    this.advance(opts);
  }

  private advance(opts: SpeakOptions): void {
    if (this.stopped) return;
    this.index += 1;
    const item = this.queue[this.index];
    if (!item) {
      this.setPlaying(false);
      this.callbacks.onQueueEnd?.();
      return;
    }

    this.callbacks.onSpanStart?.({ turnIndex: item.turnIndex, spanIndex: item.spanIndex }, item);

    const text = opts.useFallbackVoice ? item.romanized : item.devanagari;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate;
    const voice = this.resolveVoice(opts);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else if (opts.useFallbackVoice) {
      utterance.lang = "en-US";
    }

    utterance.onend = () => {
      if (this.stopped) return;
      this.pauseTimer = setTimeout(() => this.advance(opts), opts.interSentencePauseMs);
    };
    utterance.onerror = () => {
      // A voice failing mid-queue (unloaded voice, engine hiccup) should not
      // silently freeze the whole passage - skip to the next item.
      if (this.stopped) return;
      this.pauseTimer = setTimeout(() => this.advance(opts), opts.interSentencePauseMs);
    };

    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    if (!this.playing) return;
    window.speechSynthesis.pause();
    this.setPlaying(false);
  }

  resume(): void {
    if (this.stopped) return;
    window.speechSynthesis.resume();
    this.setPlaying(true);
  }

  stop(): void {
    this.stopped = true;
    this.cancelNative();
    this.setPlaying(false);
  }

  private cancelNative(): void {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    window.speechSynthesis.cancel();
  }

  private setPlaying(value: boolean): void {
    this.playing = value;
    this.callbacks.onPlayStateChange?.(value);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentIndex(): number {
    return this.index;
  }

  dispose(): void {
    this.stop();
  }
}
