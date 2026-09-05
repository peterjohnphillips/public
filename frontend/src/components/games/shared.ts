import type { VocabItemOut } from "../../types/content";
import { shuffled } from "../../hooks/useSrsQueue";

/** Distractors from the same category when possible (more plausible wrong
 * answers), falling back to whatever else is available. */
export function pickDistractors(pool: VocabItemOut[], correct: VocabItemOut, count: number): VocabItemOut[] {
  const sameCategory = pool.filter((item) => item.id !== correct.id && item.category === correct.category);
  const rest = pool.filter((item) => item.id !== correct.id && item.category !== correct.category);
  const candidates = [...shuffled(sameCategory), ...shuffled(rest)];
  return candidates.slice(0, count);
}

export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function answerMatches(userAnswer: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(userAnswer);
  return accepted.some((candidate) => normalizeAnswer(candidate) === normalized);
}

export function acceptedRomanizations(item: VocabItemOut): string[] {
  return [item.romanized, ...item.alt_romanizations];
}
