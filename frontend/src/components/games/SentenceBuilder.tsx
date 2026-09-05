import { useState } from "react";
import { useLesson } from "../../api/lessons";
import { useGameSession } from "../../hooks/useGameSession";
import { shuffled } from "../../hooks/useSrsQueue";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";

interface BuilderQuestion {
  itemRef: string;
  english: string;
  words: string[]; // canonical Nepali (romanized) order
}

function buildQuestions(lesson: NonNullable<ReturnType<typeof useLesson>["data"]>): BuilderQuestion[] {
  const fromPatterns = lesson.patterns.flatMap((pattern) =>
    pattern.examples.map((example, i) => ({
      itemRef: `${pattern.id}:${i}`,
      english: example.english,
      words: example.romanized.replace(/[।.!?]/g, "").split(/\s+/).filter(Boolean),
    })),
  );
  const fromTurns = lesson.turns.flatMap((turn) =>
    turn.spans.map((span) => ({
      itemRef: span.id,
      english: span.english,
      words: span.romanized.replace(/[।.!?]/g, "").split(/\s+/).filter(Boolean),
    })),
  );
  return [...fromPatterns, ...fromTurns].filter((q) => q.words.length >= 3);
}

/** Full production from an English prompt: no source order to recover, and
 * the tile bank includes distractor words pulled from the lesson's own
 * vocabulary, so recognising the right word matters as much as ordering it.
 *
 * Uses a local `displayIndex` rather than session.questionIndex to pick the
 * current question, advancing only once the feedback delay finishes - see
 * the comment on the same pattern in MultipleChoice.tsx for why. */
export function SentenceBuilder({ lessonId }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? undefined);
  const questions = lesson ? buildQuestions(lesson) : [];
  const total = questions.length;
  const session = useGameSession("sentence-builder", lessonId ?? null, total);

  const [displayIndex, setDisplayIndex] = useState(0);
  const [built, setBuilt] = useState<string[]>([]);
  const [bank, setBank] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [shownAt, setShownAt] = useState(Date.now());
  const [preparedIndex, setPreparedIndex] = useState(-1);

  if (!lesson) return <p>Loading...</p>;
  if (total === 0) return <p className="empty-state">This lesson has no sentences to build yet.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= total) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const question = questions[displayIndex];

  if (displayIndex !== preparedIndex) {
    setPreparedIndex(displayIndex);
    const distractorPool = lesson.vocab
      .map((item) => item.romanized)
      .filter((word) => !question.words.includes(word));
    const distractors = shuffled(distractorPool).slice(0, Math.min(4, distractorPool.length));
    setBank(shuffled([...question.words, ...distractors]));
    setBuilt([]);
  }

  const usedCounts = new Map<string, number>();
  for (const word of built) usedCounts.set(word, (usedCounts.get(word) ?? 0) + 1);
  const bankUsage = new Map<string, number>();

  const tapTile = (word: string) => {
    if (feedback) return;
    setBuilt((prev) => [...prev, word]);
  };

  const removeTile = (position: number) => {
    if (feedback) return;
    setBuilt((prev) => prev.filter((_, i) => i !== position));
  };

  const submit = async () => {
    if (feedback || built.length !== question.words.length) return;
    const wasCorrect = built.every((word, i) => word === question.words[i]);
    setFeedback(wasCorrect ? "correct" : "incorrect");
    await session.answer({ itemRef: question.itemRef, wasCorrect, responseTimeMs: Date.now() - shownAt });
    setTimeout(() => {
      setFeedback(null);
      setShownAt(Date.now());
      setDisplayIndex((i) => i + 1);
    }, 1200);
  };

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Sentence ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <p style={{ fontSize: "1.15rem" }}>{question.english}</p>
      </div>

      <div className="build-area">
        {built.map((word, position) => (
          <button key={position} className="game-tile" onClick={() => removeTile(position)}>
            {word}
          </button>
        ))}
      </div>

      <div className="word-bank">
        {bank.map((word, tileIndex) => {
          const usageSoFar = bankUsage.get(word) ?? 0;
          bankUsage.set(word, usageSoFar + 1);
          const isUsed = usageSoFar < (usedCounts.get(word) ?? 0);
          return (
            <button
              key={`${word}-${tileIndex}`}
              className="game-tile"
              disabled={isUsed || !!feedback}
              onClick={() => tapTile(word)}
            >
              {word}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--space-4)", textAlign: "center" }}>
        <Button variant="primary" onClick={submit} disabled={built.length !== question.words.length || !!feedback}>
          Check sentence
        </Button>
      </div>

      {feedback && (
        <p style={{ textAlign: "center", marginTop: "var(--space-3)", color: feedback === "correct" ? "var(--color-success)" : "var(--color-danger)" }}>
          {feedback === "correct" ? "Correct" : `Correct: ${question.words.join(" ")}`}
        </p>
      )}
    </div>
  );
}
