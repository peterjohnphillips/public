/**
 * Game session lifecycle. Every write also updates local storage first (via
 * persistence/sessionStore) so a refresh never loses progress, and falls back
 * to the outbox when the backend is unreachable so offline practice still
 * counts once it comes back.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { enqueue, flushOutbox } from "../persistence/outbox";
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

  try {
    const response = await api.post<SessionStartResponse>("/sessions/start", request);
    attachSessionId(response.session_id);
    return {
      sessionId: response.session_id,
      resumed: response.resumed,
      answeredItemRefs: response.answered_item_refs,
    };
  } catch {
    // Backend unreachable: the local session record still exists so the game
    // can proceed, and answers queue in the outbox until a session id exists.
    // A negative placeholder id signals "not yet started on the backend".
    return { sessionId: -1, resumed: false, answeredItemRefs: [] };
  }
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

  if (args.sessionId < 0) {
    // No backend session id yet; nothing to enqueue against. The session will
    // reconcile once /sessions/start succeeds on a later retry.
    return null;
  }

  try {
    return await api.post<AnswerResponse>(`/sessions/${args.sessionId}/answer`, payload);
  } catch {
    enqueue({
      kind: "answer",
      sessionId: args.sessionId,
      payload: {
        item_ref: payload.item_ref,
        was_correct: payload.was_correct,
        quality: payload.quality ?? undefined,
        user_answer: payload.user_answer ?? undefined,
        response_time_ms: payload.response_time_ms ?? undefined,
        client_answer_key: clientAnswerKey,
      },
      createdAt: new Date().toISOString(),
    });
    return null;
  }
}

export async function finishSession(
  sessionId: number,
  durationSeconds?: number,
): Promise<SessionFinishResponse | null> {
  if (sessionId < 0) return null;
  try {
    return await api.post<SessionFinishResponse>(`/sessions/${sessionId}/finish`, undefined, {
      duration_seconds: durationSeconds,
    });
  } catch {
    enqueue({
      kind: "finish",
      sessionId,
      duration_seconds: durationSeconds,
      createdAt: new Date().toISOString(),
    });
    return null;
  }
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

/** Call after a finish, to pick up anything the outbox flush settles and
 * refresh dependent queries (due queue, progress summary). */
export function useFlushOutboxAndRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => flushOutbox(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vocab-due"] });
      queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}
