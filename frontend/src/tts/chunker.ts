/**
 * Flattens a lesson's parsed turns and spans into an ordered playback queue.
 *
 * The backend already splits each turn into sentence-level spans (see
 * app/content/parser.py's split_sentences), so this does not need to reparse
 * the text - it just orders and defensively re-splits anything unexpectedly
 * long, since hand-authored content will not always be split evenly and a
 * very long "sentence" is exactly the case that trips the browser's utterance
 * truncation bug.
 */

import type { Lesson, PlaybackUnit } from "../types/content";

export interface PlaybackQueueItem {
  turnIndex: number;
  spanIndex: number;
  speaker: string | null;
  devanagari: string;
  romanized: string;
  english: string;
}

const SENTENCE_SPLIT_RE = /[^।?!.]+[।?!.]*/g;
const SOFT_MAX_LENGTH = 200;

function splitOnSentencePunctuation(text: string): string[] {
  const matches = text.match(SENTENCE_SPLIT_RE);
  if (!matches) return [text];
  return matches.map((part) => part.trim()).filter(Boolean);
}

function splitOnCommasIfTooLong(text: string): string[] {
  if (text.length <= SOFT_MAX_LENGTH) return [text];
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

/** Re-splits a span's three parallel lines only if they are unexpectedly long,
 * keeping the three lines aligned by index. Falls back to the original single
 * span whenever the three lines don't produce the same number of pieces, same
 * as the backend's own alignment fallback. */
function defensivelySplit(devanagari: string, romanized: string, english: string): Array<[string, string, string]> {
  const needsSplit = devanagari.length > SOFT_MAX_LENGTH || romanized.length > SOFT_MAX_LENGTH;
  if (!needsSplit) return [[devanagari, romanized, english]];

  const devParts = splitOnCommasIfTooLong(devanagari.length > SOFT_MAX_LENGTH ? devanagari : splitOnSentencePunctuation(devanagari).join(""));
  const romParts = splitOnCommasIfTooLong(romanized);
  const engParts = splitOnCommasIfTooLong(english);

  if (devParts.length === romParts.length && romParts.length === engParts.length && devParts.length > 1) {
    return devParts.map((dev, i) => [dev, romParts[i], engParts[i]] as [string, string, string]);
  }
  return [[devanagari, romanized, english]];
}

export function buildPlaybackQueue(turns: PlaybackUnit[]): PlaybackQueueItem[] {
  const queue: PlaybackQueueItem[] = [];
  for (const turn of turns) {
    for (const span of turn.spans) {
      const pieces = defensivelySplit(span.devanagari, span.romanized, span.english);
      for (const [devanagari, romanized, english] of pieces) {
        queue.push({
          turnIndex: turn.turn_index,
          spanIndex: span.span_index,
          speaker: turn.speaker,
          devanagari,
          romanized,
          english,
        });
      }
    }
  }
  return queue;
}

export function buildPlaybackQueueForLesson(lesson: Lesson): PlaybackQueueItem[] {
  return buildPlaybackQueue(lesson.turns);
}

/** All span ids in a lesson, for tracking listened-percentage. Matches the
 * backend's "{lesson_id}:{turn_index}:{span_index}" id scheme exactly. */
export function allSpanIds(lesson: Lesson): string[] {
  const ids: string[] = [];
  for (const turn of lesson.turns) {
    for (const span of turn.spans) {
      ids.push(span.id);
    }
  }
  return ids;
}

export function spanIdFor(lessonId: string, turnIndex: number, spanIndex: number): string {
  return `${lessonId}:${turnIndex}:${spanIndex}`;
}
