import { useState } from "react";
import { useSrsQueue } from "../../hooks/useSrsQueue";
import { useGameSession } from "../../hooks/useGameSession";
import { acceptedRomanizations, answerMatches } from "./shared";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";

/** Production and spelling: type the romanization from an English + Devanagari
 * prompt. Fuzzy-matches against the item's romanization plus any alternates
 * authored in its notes field, since Nepali romanization isn't standardised.
 *
 * Uses a local `displayIndex` rather than session.questionIndex to pick the
 * current card, advancing only once the feedback delay finishes - see the
 * comment on the same pattern in MultipleChoice.tsx for why. */
export function TypingDrill({ lessonId }: { lessonId?: string | null }) {
  const { queue } = useSrsQueue({ lesson_id: lessonId ?? undefined, limit: 20 });
  const total = queue?.length ?? 0;
  const session = useGameSession("typing-drill", lessonId ?? null, total);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [shownAt, setShownAt] = useState(Date.now());

  if (!queue) return <p>Loading...</p>;
  if (queue.length === 0) return <p className="empty-state">Nothing due for review right now.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= queue.length) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const card = queue[displayIndex];

  const submit = async () => {
    if (feedback) return;
    const wasCorrect = answerMatches(value, acceptedRomanizations(card));
    setFeedback(wasCorrect ? "correct" : "incorrect");
    await session.answer({
      itemRef: card.id,
      wasCorrect,
      userAnswer: value,
      responseTimeMs: Date.now() - shownAt,
      quality: wasCorrect ? 4 : 1,
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
        <p style={{ fontSize: "1.2rem" }}>{card.english}</p>
        <p className="devanagari" style={{ color: "var(--color-text-muted)" }}>{card.devanagari}</p>
      </div>
      <div className="answer-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type the romanization"
          disabled={!!feedback}
          autoFocus
        />
        <Button variant="primary" onClick={submit} disabled={!!feedback || !value.trim()}>
          Check
        </Button>
      </div>
      {feedback && (
        <p style={{ textAlign: "center", marginTop: "var(--space-3)", color: feedback === "correct" ? "var(--color-success)" : "var(--color-danger)" }}>
          {feedback === "correct" ? "Correct" : `Answer: ${card.romanized}`}
        </p>
      )}
    </div>
  );
}
