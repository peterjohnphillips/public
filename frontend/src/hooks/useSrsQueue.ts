/**
 * Wraps the due-vocab query into a stable, shuffle-once queue for a single
 * game round, so re-renders during play don't reshuffle the deck under the
 * user.
 */

import { useMemo, useRef } from "react";
import { useDueVocab, type DueVocabFilters } from "../api/vocab";
import type { VocabItemOut } from "../types/content";

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function useSrsQueue(filters: DueVocabFilters = {}) {
  const query = useDueVocab(filters);
  const frozenRef = useRef<VocabItemOut[] | null>(null);

  const queue = useMemo(() => {
    if (frozenRef.current) return frozenRef.current;
    if (!query.data) return null;
    const frozen = shuffled(query.data);
    frozenRef.current = frozen;
    return frozen;
  }, [query.data]);

  return { ...query, queue };
}
