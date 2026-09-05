import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./client";
import { readSnapshot, writeSnapshot } from "../persistence/snapshotStore";
import type {
  CurriculumPhase,
  GameModeStat,
  ListeningStats,
  ProgressSummary,
  StreakDay,
  VocabMastery,
  WeakItem,
} from "../types/content";

/** Paints the cached snapshot immediately, then refetches and re-caches on
 * success, so the dashboard never flashes empty on reload. */
export function useProgressSummary() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["progress", "summary"],
    queryFn: () => api.get<ProgressSummary>("/progress/summary"),
    placeholderData: () => readSnapshot() ?? undefined,
  });

  useEffect(() => {
    if (query.data) writeSnapshot(query.data);
  }, [query.data]);

  return { ...query, refetchAll: () => queryClient.invalidateQueries({ queryKey: ["progress"] }) };
}

export function useStreakCalendar(days = 56) {
  return useQuery({
    queryKey: ["progress", "streak", days],
    queryFn: () => api.get<StreakDay[]>("/progress/streak", { days }),
  });
}

export function useVocabMastery() {
  return useQuery({
    queryKey: ["progress", "vocab-mastery"],
    queryFn: () => api.get<VocabMastery>("/progress/vocab-mastery"),
  });
}

export function useGameModeStats() {
  return useQuery({
    queryKey: ["progress", "game-modes"],
    queryFn: () => api.get<GameModeStat[]>("/progress/game-modes"),
  });
}

export function useWeakestItems(limit = 20) {
  return useQuery({
    queryKey: ["progress", "weakest", limit],
    queryFn: () => api.get<WeakItem[]>("/progress/weakest", { limit }),
  });
}

export function useListeningStats() {
  return useQuery({
    queryKey: ["progress", "listening"],
    queryFn: () => api.get<ListeningStats>("/progress/listening"),
  });
}

export function useCurriculumPhases() {
  return useQuery({
    queryKey: ["progress", "curriculum"],
    queryFn: () => api.get<CurriculumPhase[]>("/progress/curriculum"),
    staleTime: Infinity, // static data
  });
}
