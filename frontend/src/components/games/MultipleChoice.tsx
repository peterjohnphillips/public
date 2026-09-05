import { useMemo, useState } from "react";
import { useSrsQueue, shuffled } from "../../hooks/useSrsQueue";
import { useGameSession } from "../../hooks/useGameSession";
import { pickDistractors } from "./shared";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import type { VocabItemOut } from "../../types/content";

/** Recognition, lower cognitive load than recall - the on-ramp for brand new
 * words. Distractors come from the same category for plausibility.
 *
 * Uses its own `displayIndex` rather than session.questionIndex to pick the
 * current card: the hook's questionIndex advances the instant an answer is
 * submitted, but the feedback (correct/incorrect highlight) needs to keep
 * showing the question just answered for a moment - reading straight from
 * session.questionIndex would flip the card underneath the still-visible
 * feedback and mislabel it. */
export function MultipleChoice({ lessonId }: { lessonId?: string | null }) {
  const { queue, data: pool } = useSrsQueue({ lesson_id: lessonId ?? undefined, limit: 20 });
  const total = queue?.length ?? 0;
  const session = useGameSession("multiple-choice", lessonId ?? null, total);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [shownAt, setShownAt] = useState(Date.now());

  const card = queue?.[displayIndex];

  const options = useMemo(() => {
    if (!card || !pool) return [];
    const distractors = pickDistractors(pool, card, 3);
    return shuffled([card, ...distractors]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, pool]);

  if (!queue || !pool) return <p>Loading...</p>;
  if (queue.length === 0) return <p className="empty-state">Nothing due for review right now.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;
  if (displayIndex >= queue.length) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  if (!card) return null;

  const choose = async (option: VocabItemOut) => {
    if (selected) return;
    setSelected(option.id);
    const wasCorrect = option.id === card.id;
    await session.answer({ itemRef: card.id, wasCorrect, responseTimeMs: Date.now() - shownAt });
    setTimeout(() => {
      setSelected(null);
      setShownAt(Date.now());
      setDisplayIndex((i) => i + 1);
    }, 700);
  };

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Question ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <p className="devanagari" style={{ fontSize: "1.6rem" }}>{card.devanagari}</p>
        <p style={{ color: "var(--color-text-muted)" }}>{card.romanized}</p>
      </div>
      <div className="game-grid">
        {options.map((option) => {
          let variant = "";
          if (selected) {
            if (option.id === card.id) variant = "game-tile--correct";
            else if (option.id === selected) variant = "game-tile--incorrect";
          }
          return (
            <button
              key={option.id}
              className={`game-tile ${variant}`}
              onClick={() => choose(option)}
              disabled={!!selected}
            >
              {option.english}
            </button>
          );
        })}
      </div>
    </div>
  );
}
