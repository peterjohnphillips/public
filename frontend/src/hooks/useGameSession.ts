/**
 * Generic game session lifecycle used by every game mode component: start on
 * mount, submit each answer (writing through local storage first so a
 * refresh mid-game restores the exact question), finish at the end.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { finishSession, startGameSession, submitAnswer } from "../api/sessions";
import { readSession } from "../persistence/sessionStore";
import { clearSession } from "../persistence/sessionStore";
import type { SessionFinishResponse } from "../types/content";

export interface UseGameSessionResult {
  sessionId: number | null;
  ready: boolean;
  questionIndex: number;
  correctCount: number;
  resumedAnsweredRefs: Set<string>;
  answer: (args: {
    itemRef: string;
    wasCorrect: boolean;
    quality?: number;
    userAnswer?: string;
    responseTimeMs?: number;
  }) => Promise<void>;
  finish: () => Promise<SessionFinishResponse | null>;
  finished: boolean;
  finalResult: SessionFinishResponse | null;
}

export function useGameSession(gameMode: string, lessonId: string | null, totalQuestions: number): UseGameSessionResult {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [resumedAnsweredRefs, setResumedAnsweredRefs] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const [finalResult, setFinalResult] = useState<SessionFinishResponse | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await startGameSession(gameMode, lessonId, totalQuestions);
      if (cancelled) return;
      setSessionId(result.sessionId);
      setResumedAnsweredRefs(new Set(result.answeredItemRefs));

      const local = readSession();
      if (local && local.gameMode === gameMode && local.lessonId === lessonId) {
        setQuestionIndex(local.questionIndex);
        setCorrectCount(local.correctCount);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per mounted game instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = useCallback<UseGameSessionResult["answer"]>(
    async ({ itemRef, wasCorrect, quality, userAnswer, responseTimeMs }) => {
      if (sessionId === null) return;
      setQuestionIndex((i) => i + 1);
      if (wasCorrect) setCorrectCount((c) => c + 1);
      await submitAnswer({ sessionId, itemRef, wasCorrect, quality, userAnswer, responseTimeMs });
    },
    [sessionId],
  );

  const finish = useCallback(async () => {
    if (sessionId === null) return null;
    const durationSeconds = Math.round((Date.now() - startedAt.current) / 1000);
    const result = await finishSession(sessionId, durationSeconds);
    setFinished(true);
    setFinalResult(
      result ?? {
        session_id: sessionId,
        score: questionIndex > 0 ? correctCount / questionIndex : null,
        total_items: questionIndex,
        correct_items: correctCount,
        duration_seconds: durationSeconds,
        streak_days: 0,
      },
    );
    clearSession();
    return result;
  }, [sessionId, questionIndex, correctCount]);

  return { sessionId, ready, questionIndex, correctCount, resumedAnsweredRefs, answer, finish, finished, finalResult };
}
