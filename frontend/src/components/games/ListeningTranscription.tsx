import { useMemo, useState } from "react";
import { useLesson } from "../../api/lessons";
import { useGameSession } from "../../hooks/useGameSession";
import { usePlaySingle } from "../../tts/usePlaySingle";
import { answerMatches } from "./shared";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";

interface TranscriptionQuestion {
  itemRef: string;
  devanagari: string;
  romanized: string;
  english: string;
}

/** The hardest listening mode: type back what was heard, with replay and a
 * slow-rate toggle. The typed answer is stored (via session.answer's
 * userAnswer) so misses can be reviewed later - a partial substitute for
 * having no human tutor in the loop. */
export function ListeningTranscription({ lessonId }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? undefined);
  const player = usePlaySingle();

  const questions = useMemo<TranscriptionQuestion[]>(() => {
    if (!lesson) return [];
    return lesson.turns.flatMap((turn) =>
      turn.spans.map((span) => ({
        itemRef: span.id,
        devanagari: span.devanagari,
        romanized: span.romanized,
        english: span.english,
      })),
    );
  }, [lesson]);

  const total = questions.length;
  const session = useGameSession("listening-transcription", lessonId ?? null, total);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [shownAt, setShownAt] = useState(Date.now());

  if (!lesson) return <p>Loading...</p>;
  if (total === 0) return <p className="empty-state">This lesson has no lines to transcribe yet.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= total) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const question = questions[displayIndex];

  const submit = async () => {
    if (feedback) return;
    const wasCorrect = answerMatches(value, [question.romanized]);
    setFeedback(wasCorrect ? "correct" : "incorrect");
    await session.answer({
      itemRef: question.itemRef,
      wasCorrect,
      userAnswer: value,
      responseTimeMs: Date.now() - shownAt,
    });
  };

  const next = () => {
    setValue("");
    setFeedback(null);
    setShownAt(Date.now());
    setDisplayIndex((i) => i + 1);
  };

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Line ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <Button variant="primary" onClick={() => player.play(question.devanagari, question.romanized)}>
            {player.isPlaying ? "Playing..." : "Play"}
          </Button>
          <Button variant="secondary" onClick={() => player.play(question.devanagari, question.romanized, 0.55)}>
            Play slowly
          </Button>
        </div>
      </div>
      <div className="answer-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type what you heard"
          disabled={!!feedback}
          autoFocus
        />
        <Button variant="primary" onClick={submit} disabled={!!feedback || !value.trim()}>
          Check
        </Button>
      </div>
      {feedback && (
        <div style={{ textAlign: "center", marginTop: "var(--space-3)" }}>
          <p style={{ color: feedback === "correct" ? "var(--color-success)" : "var(--color-danger)" }}>
            {feedback === "correct" ? "Correct" : `Heard: ${question.romanized}`}
          </p>
          <p className="devanagari" style={{ color: "var(--color-text-muted)" }}>{question.devanagari}</p>
          <Button variant="primary" onClick={next}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
