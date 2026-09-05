import { useMemo, useState } from "react";
import { useLesson } from "../../api/lessons";
import { useGameSession } from "../../hooks/useGameSession";
import { shuffled } from "../../hooks/useSrsQueue";
import { GameSummary } from "./GameSummary";
import { ProgressBar } from "../ui/ProgressBar";
import type { CharacterItem } from "../../types/content";

const ROUND_SIZE = 12;

/** Akshara-level decoding in short bursts, sourced from the script reference
 * lesson. Reuses the vocab progress table under a char- id convention (see
 * backend/app/models/schemas.py CharacterItem) rather than a dedicated table,
 * so grading this still feeds the same SRS scheduler as word review. */
export function CharacterRecognition({ lessonId = "script-devanagari" }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? "script-devanagari");
  const allCharacters = lesson?.characters ?? [];

  const round = useMemo(() => shuffled(allCharacters).slice(0, ROUND_SIZE), [allCharacters]);
  const total = round.length;
  const session = useGameSession("character-recognition", lessonId ?? null, total);

  const [displayIndex, setDisplayIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [preparedIndex, setPreparedIndex] = useState(-1);
  const [options, setOptions] = useState<CharacterItem[]>([]);

  if (!lesson) return <p>Loading...</p>;
  if (total === 0) return <p className="empty-state">No script characters found in content yet.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  if (displayIndex >= total) {
    void session.finish();
    return <p>Finishing up...</p>;
  }
  const character = round[displayIndex];

  if (displayIndex !== preparedIndex) {
    setPreparedIndex(displayIndex);
    const distractors = shuffled(allCharacters.filter((c) => c.id !== character.id)).slice(0, 3);
    setOptions(shuffled([character, ...distractors]));
    setSelected(null);
  }

  const choose = async (option: CharacterItem) => {
    if (selected) return;
    setSelected(option.id);
    const wasCorrect = option.id === character.id;
    await session.answer({ itemRef: character.id, wasCorrect });
    setTimeout(() => {
      setSelected(null);
      setDisplayIndex((i) => i + 1);
    }, 600);
  };

  return (
    <div>
      <ProgressBar fraction={displayIndex / total} label={`Character ${displayIndex + 1} of ${total}`} />
      <div className="card" style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
        <p className="devanagari" style={{ fontSize: "2.4rem" }}>{character.devanagari}</p>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>Which sound is this?</p>
      </div>
      <div className="game-grid">
        {options.map((option) => {
          let variant = "";
          if (selected) {
            if (option.id === character.id) variant = "game-tile--correct";
            else if (option.id === selected) variant = "game-tile--incorrect";
          }
          return (
            <button key={option.id} className={`game-tile ${variant}`} onClick={() => choose(option)} disabled={!!selected}>
              {option.romanized}
            </button>
          );
        })}
      </div>
    </div>
  );
}
