import { useState } from "react";
import { useSrsQueue } from "../../hooks/useSrsQueue";
import { useGameSession } from "../../hooks/useGameSession";
import { Button } from "../ui/Button";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";

const GRADE_BUTTONS = [
  { label: "Again", quality: 1, variant: "secondary" as const },
  { label: "Hard", quality: 3, variant: "secondary" as const },
  { label: "Good", quality: 4, variant: "primary" as const },
  { label: "Easy", quality: 5, variant: "primary" as const },
];

/** SRS review: card flips to reveal, then the user self-grades on four
 * Anki-style buttons. Direction (Nepali->English or English->Nepali) comes
 * from settings, randomized per card here for variety. */
export function Flashcards({ lessonId }: { lessonId?: string | null }) {
  const { queue } = useSrsQueue({ lesson_id: lessonId ?? undefined, limit: 20 });
  const total = queue?.length ?? 0;
  const session = useGameSession("flashcards", lessonId ?? null, total);
  const [flipped, setFlipped] = useState(false);
  const [shownAt, setShownAt] = useState(Date.now());

  if (!queue) return <p>Loading review queue...</p>;
  if (queue.length === 0) return <p className="empty-state">Nothing due for review right now. Come back later.</p>;

  if (session.finished && session.finalResult) {
    return <GameSummary result={session.finalResult} />;
  }

  const index = session.questionIndex;
  if (index >= queue.length) {
    void session.finish();
    return <p>Finishing up...</p>;
  }

  const card = queue[index];
  const promptFirst = index % 2 === 0; // alternate direction for variety

  const grade = async (quality: number) => {
    await session.answer({
      itemRef: card.id,
      wasCorrect: quality >= 3,
      quality,
      responseTimeMs: Date.now() - shownAt,
    });
    setFlipped(false);
    setShownAt(Date.now());
  };

  return (
    <div>
      <ProgressBar fraction={index / total} label={`Card ${index + 1} of ${total}`} />
      <div
        className="card"
        style={{ textAlign: "center", minHeight: 160, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}
        onClick={() => setFlipped((f) => !f)}
      >
        {!flipped ? (
          <div>
            {promptFirst ? (
              <p className="devanagari" style={{ fontSize: "1.6rem" }}>{card.devanagari}</p>
            ) : (
              <p style={{ fontSize: "1.3rem" }}>{card.english}</p>
            )}
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Tap to reveal</p>
          </div>
        ) : (
          <div>
            {promptFirst ? (
              <>
                <p style={{ fontSize: "1.1rem" }}>{card.romanized}</p>
                <p style={{ fontSize: "1.3rem" }}>{card.english}</p>
              </>
            ) : (
              <>
                <p className="devanagari" style={{ fontSize: "1.6rem" }}>{card.devanagari}</p>
                <p style={{ fontSize: "1.1rem", color: "var(--color-text-muted)" }}>{card.romanized}</p>
              </>
            )}
          </div>
        )}
      </div>
      {flipped && (
        <div className="button-row" style={{ marginTop: "var(--space-4)", justifyContent: "center" }}>
          {GRADE_BUTTONS.map((btn) => (
            <Button key={btn.label} variant={btn.variant} onClick={() => grade(btn.quality)}>
              {btn.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
