import { useMemo, useState } from "react";
import { useLesson } from "../../api/lessons";
import { useGameSession } from "../../hooks/useGameSession";
import { shuffled } from "../../hooks/useSrsQueue";
import { usePlaySingle } from "../../tts/usePlaySingle";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";

interface ListenQuestion {
  itemRef: string;
  devanagari: string;
  romanized: string;
  english: string;
}

/** Audio plays, meaning is chosen from four options, with the text of what
 * was said revealed only after answering, so the answer really tests
 * listening rather than reading.
 *
 * Uses a local `displayIndex` rather than session.questionIndex to pick the
 * current question, advancing only once the reveal is dismissed - see the
 * comment on the same pattern in MultipleChoice.tsx for why. */
export function ListeningComprehension({ lessonId }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? undefined);
  const player = usePlaySingle();

  const questions = useMemo<ListenQuestion[]>(() => {
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
  const session = useGameSession("listening-comprehension", lessonId ?? null, total);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [preparedIndex, setPreparedIndex] = useState(-1);
  const [options, setOptions] = useState<ListenQuestion[]>([]);
  const [shownAt, setShownAt] = useState(Date.now());

  if (!lesson) return <p>Loading...</p>;
  if (total < 2) return <p className="empty-state">This lesson needs at least two lines to build a listening quiz.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= total) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const question = questions[displayIndex];

  if (displayIndex !== preparedIndex) {
    setPreparedIndex(displayIndex);
    const others = shuffled(questions.filter((q) => q.itemRef !== question.itemRef)).slice(0, 3);
    setOptions(shuffled([question, ...others]));
    setRevealed(false);
    setSelected(null);
  }

  const choose = async (option: ListenQuestion) => {
    if (revealed) return;
    setSelected(option.itemRef);
    setRevealed(true);
    const wasCorrect = option.itemRef === question.itemRef;
    await session.answer({ itemRef: question.itemRef, wasCorrect, responseTimeMs: Date.now() - shownAt });
  };

  const next = () => {
    setShownAt(Date.now());
    setDisplayIndex((i) => i + 1);
  };

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Question ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <Button variant="primary" onClick={() => player.play(question.devanagari, question.romanized)}>
          {player.isPlaying ? "Playing..." : "Play"}
        </Button>
        {revealed && (
          <p className="devanagari" style={{ marginTop: "var(--space-3)" }}>
            {question.devanagari}
            <br />
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{question.romanized}</span>
          </p>
        )}
      </div>
      <div className="game-grid">
        {options.map((option) => {
          let variant = "";
          if (revealed) {
            if (option.itemRef === question.itemRef) variant = "game-tile--correct";
            else if (option.itemRef === selected) variant = "game-tile--incorrect";
          }
          return (
            <button key={option.itemRef} className={`game-tile ${variant}`} onClick={() => choose(option)} disabled={revealed}>
              {option.english}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          <Button variant="primary" onClick={next}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
