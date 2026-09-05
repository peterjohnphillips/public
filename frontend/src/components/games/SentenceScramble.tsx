import { useMemo, useState } from "react";
import { useLesson } from "../../api/lessons";
import { useGameSession } from "../../hooks/useGameSession";
import { shuffled } from "../../hooks/useSrsQueue";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";

interface ScrambleQuestion {
  itemRef: string;
  words: string[]; // canonical order
  english: string;
}

/** Word-order awareness, which matters given Nepali's subject-object-verb
 * order against English's subject-verb-object. Shuffled tiles are tapped back
 * into order; on submit the sequence is compared to the canonical one.
 *
 * Uses a local `displayIndex` rather than session.questionIndex to pick the
 * current question, advancing only once the feedback delay finishes - see
 * the comment on the same pattern in MultipleChoice.tsx for why. */
export function SentenceScramble({ lessonId }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? undefined);

  const questions = useMemo<ScrambleQuestion[]>(() => {
    if (!lesson) return [];
    const fromPatterns = lesson.patterns.flatMap((pattern) =>
      pattern.examples.map((example, i) => ({
        itemRef: `${pattern.id}:${i}`,
        words: example.romanized.replace(/[।.!?]/g, "").split(/\s+/).filter(Boolean),
        english: example.english,
      })),
    );
    const fromTurns = lesson.turns.flatMap((turn) =>
      turn.spans.map((span) => ({
        itemRef: span.id,
        words: span.romanized.replace(/[।.!?]/g, "").split(/\s+/).filter(Boolean),
        english: span.english,
      })),
    );
    return [...fromPatterns, ...fromTurns].filter((q) => q.words.length >= 3);
  }, [lesson]);

  const total = questions.length;
  const session = useGameSession("sentence-scramble", lessonId ?? null, total);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [built, setBuilt] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [shownAt, setShownAt] = useState(Date.now());
  const [preparedIndex, setPreparedIndex] = useState(-1);

  if (!lesson) return <p>Loading...</p>;
  if (total === 0) return <p className="empty-state">This lesson has no sentences long enough to scramble yet.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= total) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const question = questions[displayIndex];

  // Reshuffle the tile order only when a genuinely new question is displayed
  // (i.e. once feedback has cleared and displayIndex has advanced), not on
  // every render.
  if (displayIndex !== preparedIndex) {
    setPreparedIndex(displayIndex);
    setOrder(shuffled(question.words.map((_, i) => i)));
    setBuilt([]);
  }

  const tapTile = (wordIndex: number) => {
    if (feedback) return;
    setBuilt((prev) => [...prev, wordIndex]);
  };

  const removeTile = (position: number) => {
    if (feedback) return;
    setBuilt((prev) => prev.filter((_, i) => i !== position));
  };

  const submit = async () => {
    if (feedback || built.length !== question.words.length) return;
    const wasCorrect = built.every((wordIndex, i) => wordIndex === i);
    setFeedback(wasCorrect ? "correct" : "incorrect");
    await session.answer({ itemRef: question.itemRef, wasCorrect, responseTimeMs: Date.now() - shownAt });
    setTimeout(() => {
      setFeedback(null);
      setShownAt(Date.now());
      setDisplayIndex((i) => i + 1);
    }, 1100);
  };

  const usedIndices = new Set(built);

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Sentence ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <p style={{ fontSize: "1.15rem" }}>{question.english}</p>
      </div>

      <div className="build-area">
        {built.map((wordIndex, position) => (
          <button key={position} className="game-tile" onClick={() => removeTile(position)}>
            {question.words[wordIndex]}
          </button>
        ))}
      </div>

      <div className="word-bank">
        {order.map((wordIndex) => (
          <button
            key={wordIndex}
            className="game-tile"
            disabled={usedIndices.has(wordIndex) || !!feedback}
            onClick={() => tapTile(wordIndex)}
          >
            {question.words[wordIndex]}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-4)", textAlign: "center" }}>
        <Button variant="primary" onClick={submit} disabled={built.length !== question.words.length || !!feedback}>
          Check order
        </Button>
      </div>

      {feedback && (
        <p style={{ textAlign: "center", marginTop: "var(--space-3)", color: feedback === "correct" ? "var(--color-success)" : "var(--color-danger)" }}>
          {feedback === "correct" ? "Correct order" : `Correct: ${question.words.join(" ")}`}
        </p>
      )}
    </div>
  );
}
