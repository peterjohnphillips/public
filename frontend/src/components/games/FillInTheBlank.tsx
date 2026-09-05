import { useMemo, useState } from "react";
import { useLesson } from "../../api/lessons";
import { useGameSession } from "../../hooks/useGameSession";
import { answerMatches } from "./shared";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";

interface BlankQuestion {
  patternId: string;
  before: string;
  after: string;
  answer: string;
  english: string;
}

/** Generated directly from the ___ slot in sentence patterns, by diffing the
 * template against each filled example - no separate authoring needed.
 *
 * Uses a local `displayIndex` rather than session.questionIndex to pick the
 * current question, advancing only once the feedback delay finishes - see
 * the comment on the same pattern in MultipleChoice.tsx for why. */
export function FillInTheBlank({ lessonId }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? undefined);

  const questions = useMemo<BlankQuestion[]>(() => {
    if (!lesson) return [];
    const out: BlankQuestion[] = [];
    for (const pattern of lesson.patterns) {
      const [before, after] = pattern.template_romanized.split("___");
      for (const example of pattern.examples) {
        if (!example.blank_romanized) continue;
        out.push({
          patternId: pattern.id,
          before: (before ?? "").trim(),
          after: (after ?? "").trim(),
          answer: example.blank_romanized,
          english: example.english,
        });
      }
    }
    return out;
  }, [lesson]);

  const total = questions.length;
  const session = useGameSession("fill-in-blank", lessonId ?? null, total);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [shownAt, setShownAt] = useState(Date.now());

  if (!lesson) return <p>Loading...</p>;
  if (total === 0) return <p className="empty-state">This lesson has no sentence patterns to drill yet.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= total) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const question = questions[displayIndex];

  const submit = async () => {
    if (feedback) return;
    const wasCorrect = answerMatches(value, [question.answer]);
    setFeedback(wasCorrect ? "correct" : "incorrect");
    await session.answer({
      itemRef: question.patternId,
      wasCorrect,
      userAnswer: value,
      responseTimeMs: Date.now() - shownAt,
    });
    setTimeout(() => {
      setValue("");
      setFeedback(null);
      setShownAt(Date.now());
      setDisplayIndex((i) => i + 1);
    }, 900);
  };

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Question ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <p style={{ fontSize: "1.2rem" }}>{question.english}</p>
        <p style={{ marginTop: "var(--space-2)" }}>
          {question.before} <strong>___</strong> {question.after}
        </p>
      </div>
      <div className="answer-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Fill the blank"
          disabled={!!feedback}
          autoFocus
        />
        <Button variant="primary" onClick={submit} disabled={!!feedback || !value.trim()}>
          Check
        </Button>
      </div>
      {feedback && (
        <p style={{ textAlign: "center", marginTop: "var(--space-3)", color: feedback === "correct" ? "var(--color-success)" : "var(--color-danger)" }}>
          {feedback === "correct" ? "Correct" : `Answer: ${question.answer}`}
        </p>
      )}
    </div>
  );
}
