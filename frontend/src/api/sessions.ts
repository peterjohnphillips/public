/**
 * Game session lifecycle. Every write also updates local storage first (via
 * persistence/sessionStore) so a refresh never loses progress. There is no
 * server to be unreachable - api/client.ts serves every request in-process
 * against local storage - so writes here either succeed or throw a real bug,
 * never a network failure to retry later.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { newId } from "../persistence/localStore";
import {
  attachSessionId,
  readSession,
  recordAnswer,
  startNewSession,
} from "../persistence/sessionStore";
import type {
  AnswerRequest,
  AnswerResponse,
  SessionFinishResponse,
  SessionOut,
  SessionStartRequest,
  SessionStartResponse,
} from "../types/content";

/** Starts a game, both on the backend and in local storage. If a resumable
 * in-flight session already exists for this exact game/lesson, its
 * client_session_key is reused so the backend reattaches to the same row
 * instead of creating a duplicate. */
export async function startGameSession(
  gameMode: string,
  lessonId: string | null,
  totalQuestions: number,
): Promise<{ sessionId: number; resumed: boolean; answeredItemRefs: string[] }> {
  const existing = readSession();
  const reuseExisting =
    existing && existing.gameMode === gameMode && existing.lessonId === lessonId && existing.sessionId !== null;

  const local = reuseExisting ? existing! : startNewSession(gameMode, lessonId, totalQuestions);

  const request: SessionStartRequest = {
    game_mode: gameMode,
    lesson_id: lessonId,
    client_session_key: local.clientSessionKey,
  };

  const response = await api.post<SessionStartResponse>("/sessions/start", request);
  attachSessionId(response.session_id);
  return {
    sessionId: response.session_id,
    resumed: response.resumed,
    answeredItemRefs: response.answered_item_refs,
  };
}

export interface SubmitAnswerArgs {
  sessionId: number;
  itemRef: string;
  wasCorrect: boolean;
  quality?: number;
  userAnswer?: string;
  responseTimeMs?: number;
}

export async function submitAnswer(args: SubmitAnswerArgs): Promise<AnswerResponse | null> {
  const clientAnswerKey = newId();
  recordAnswer({
    itemRef: args.itemRef,
    wasCorrect: args.wasCorrect,
    quality: args.quality,
    userAnswer: args.userAnswer,
    responseTimeMs: args.responseTimeMs,
    clientAnswerKey,
  });

  const payload: AnswerRequest = {
    item_ref: args.itemRef,
    was_correct: args.wasCorrect,
    quality: args.quality,
    user_answer: args.userAnswer,
    response_time_ms: args.responseTimeMs,
    client_answer_key: clientAnswerKey,
  };

  return api.post<AnswerResponse>(`/sessions/${args.sessionId}/answer`, payload);
}

export async function finishSession(
  sessionId: number,
  durationSeconds?: number,
): Promise<SessionFinishResponse | null> {
  return api.post<SessionFinishResponse>(`/sessions/${sessionId}/finish`, undefined, {
    duration_seconds: durationSeconds,
  });
}

export function useSessionDetail(sessionId: number | null) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.get<SessionOut>(`/sessions/${sessionId}`),
    enabled: sessionId != null && sessionId >= 0,
  });
}

export function useRecentSessions(gameMode?: string) {
  return useQuery({
    queryKey: ["sessions", gameMode],
    queryFn: () => api.get<SessionOut[]>("/sessions", gameMode ? { game_mode: gameMode } : undefined),
  });
}
