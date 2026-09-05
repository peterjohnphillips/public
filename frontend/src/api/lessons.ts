import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type QueryParams } from "./client";
import type { ContentLoadError, Lesson, LessonSummary, SkillType, ContentStatus } from "../types/content";

export interface LessonFilters extends QueryParams {
  week?: number;
  skill_type?: SkillType;
  status?: ContentStatus;
  has_audio?: boolean;
}

export function useLessons(filters: LessonFilters = {}) {
  return useQuery({
    queryKey: ["lessons", filters],
    queryFn: () => api.get<LessonSummary[]>("/lessons", filters),
  });
}

export function useLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: () => api.get<Lesson>(`/lessons/${encodeURIComponent(lessonId!)}`),
    enabled: !!lessonId,
  });
}

export function useCompleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, minutes }: { lessonId: string; minutes: number }) =>
      api.post<LessonSummary>(`/lessons/${encodeURIComponent(lessonId)}/complete`, undefined, { minutes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

export function useContentErrors() {
  return useQuery({
    queryKey: ["content-errors"],
    queryFn: () => api.get<ContentLoadError[]>("/content/errors"),
    staleTime: 60_000,
  });
}
