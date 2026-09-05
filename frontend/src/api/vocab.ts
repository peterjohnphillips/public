import { useQuery } from "@tanstack/react-query";
import { api, type QueryParams } from "./client";
import type { MasteryBucket, VocabCategory, VocabItemOut } from "../types/content";

export interface VocabFilters extends QueryParams {
  category?: VocabCategory;
  lesson_id?: string;
  introduced_week?: number;
  bucket?: MasteryBucket;
  limit?: number;
}

export function useVocabList(filters: VocabFilters = {}) {
  return useQuery({
    queryKey: ["vocab", filters],
    queryFn: () => api.get<VocabItemOut[]>("/vocab", filters),
  });
}

export interface DueVocabFilters extends QueryParams {
  limit?: number;
  category?: VocabCategory;
  lesson_id?: string;
}

export function useDueVocab(filters: DueVocabFilters = {}) {
  return useQuery({
    queryKey: ["vocab-due", filters],
    queryFn: () => api.get<VocabItemOut[]>("/vocab/due", filters),
  });
}

export function useVocabItem(vocabId: string | undefined) {
  return useQuery({
    queryKey: ["vocab-item", vocabId],
    queryFn: () => api.get<VocabItemOut>(`/vocab/${encodeURIComponent(vocabId!)}`),
    enabled: !!vocabId,
  });
}
