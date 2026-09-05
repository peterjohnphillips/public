import type { ComponentType } from "react";
import { Flashcards } from "./Flashcards";
import { MultipleChoice } from "./MultipleChoice";
import { MatchingPairs } from "./MatchingPairs";
import { TypingDrill } from "./TypingDrill";
import { FillInTheBlank } from "./FillInTheBlank";
import { SentenceScramble } from "./SentenceScramble";
import { SentenceBuilder } from "./SentenceBuilder";
import { ListeningComprehension } from "./ListeningComprehension";
import { ListeningTranscription } from "./ListeningTranscription";
import { ReadAlong } from "./ReadAlong";
import { CharacterRecognition } from "./CharacterRecognition";

export interface GameModeProps {
  lessonId?: string | null;
}

export interface GameModeInfo {
  key: string;
  label: string;
  description: string;
  component: ComponentType<GameModeProps>;
  /** Whether this mode needs a specific lesson (sentence patterns / dialogue
   * content) rather than drawing from the global SRS due queue. */
  requiresLesson: boolean;
}

export const GAME_MODES: GameModeInfo[] = [
  {
    key: "flashcards",
    label: "Flashcards",
    description: "SRS recall, self-graded",
    component: Flashcards,
    requiresLesson: false,
  },
  {
    key: "multiple-choice",
    label: "Multiple Choice",
    description: "Recognition from four options",
    component: MultipleChoice,
    requiresLesson: false,
  },
  {
    key: "matching-pairs",
    label: "Matching Pairs",
    description: "Memory-match Nepali to English",
    component: MatchingPairs,
    requiresLesson: false,
  },
  {
    key: "typing-drill",
    label: "Typing Drill",
    description: "Type the romanization",
    component: TypingDrill,
    requiresLesson: false,
  },
  {
    key: "fill-in-blank",
    label: "Fill in the Blank",
    description: "Complete a sentence pattern",
    component: FillInTheBlank,
    requiresLesson: true,
  },
  {
    key: "sentence-scramble",
    label: "Sentence Scramble",
    description: "Reorder shuffled words",
    component: SentenceScramble,
    requiresLesson: true,
  },
  {
    key: "sentence-builder",
    label: "Sentence Builder",
    description: "Build a sentence from a word bank",
    component: SentenceBuilder,
    requiresLesson: true,
  },
  {
    key: "listening-comprehension",
    label: "Listening Comprehension",
    description: "Hear it, pick the meaning",
    component: ListeningComprehension,
    requiresLesson: true,
  },
  {
    key: "listening-transcription",
    label: "Listening Transcription",
    description: "Type back what you heard",
    component: ListeningTranscription,
    requiresLesson: true,
  },
  {
    key: "read-along",
    label: "Read Along",
    description: "Practice reading with audio, ungraded",
    component: ReadAlong,
    requiresLesson: true,
  },
  {
    key: "character-recognition",
    label: "Script Drill",
    description: "Devanagari character recognition",
    component: CharacterRecognition,
    requiresLesson: false,
  },
];

export function getGameMode(key: string): GameModeInfo | undefined {
  return GAME_MODES.find((mode) => mode.key === key);
}
