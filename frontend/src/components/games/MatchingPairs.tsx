import { useMemo, useState } from "react";
import { useDueVocab } from "../../api/vocab";
import { shuffled } from "../../hooks/useSrsQueue";
import { useGameSession } from "../../hooks/useGameSession";
import { GameSummary } from "./GameSummary";

interface Tile {
  key: string;
  vocabId: string;
  text: string;
  side: "nepali" | "english";
}

/** Classic memory-match: Nepali tiles against English tiles. Recognition
 * speed over a themed six-to-eight pair grid. */
export function MatchingPairs({ lessonId }: { lessonId?: string | null }) {
  const { data: pool } = useDueVocab({ lesson_id: lessonId ?? undefined, limit: 8 });
  const pairCount = Math.min(pool?.length ?? 0, 6);
  const session = useGameSession("matching-pairs", lessonId ?? null, pairCount);

  const [selected, setSelected] = useState<Tile | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);

  const tiles = useMemo<Tile[]>(() => {
    if (!pool) return [];
    const chosen = pool.slice(0, pairCount);
    const nepaliTiles: Tile[] = chosen.map((item) => ({ key: `n-${item.id}`, vocabId: item.id, text: item.devanagari, side: "nepali" }));
    const englishTiles: Tile[] = chosen.map((item) => ({ key: `e-${item.id}`, vocabId: item.id, text: item.english, side: "english" }));
    return shuffled([...nepaliTiles, ...englishTiles]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, pairCount]);

  if (!pool) return <p>Loading...</p>;
  if (pairCount === 0) return <p className="empty-state">Nothing due for review right now.</p>;
  if (session.finished && session.finalResult) return <GameSummary result={session.finalResult} />;

  const allMatched = matchedIds.size === pairCount;
  if (allMatched && !session.finished) {
    void session.finish();
    return <p>Finishing up...</p>;
  }

  const handleTap = async (tile: Tile) => {
    if (matchedIds.has(tile.vocabId) || wrongPair) return;
    if (!selected) {
      setSelected(tile);
      return;
    }
    if (selected.key === tile.key) return;

    if (selected.vocabId === tile.vocabId && selected.side !== tile.side) {
      setMatchedIds((prev) => new Set(prev).add(tile.vocabId));
      setSelected(null);
      await session.answer({ itemRef: tile.vocabId, wasCorrect: true });
    } else {
      setWrongPair([selected.key, tile.key]);
      await session.answer({ itemRef: tile.vocabId, wasCorrect: false });
      setTimeout(() => {
        setWrongPair(null);
        setSelected(null);
      }, 600);
    }
  };

  return (
    <div>
      <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
        {matchedIds.size} / {pairCount} pairs matched
      </p>
      <div className="game-grid">
        {tiles.map((tile) => {
          const isMatched = matchedIds.has(tile.vocabId);
          const isSelected = selected?.key === tile.key;
          const isWrong = wrongPair?.includes(tile.key);
          const classes = [
            "game-tile",
            tile.side === "nepali" ? "devanagari" : "",
            isMatched ? "game-tile--matched" : "",
            isSelected ? "game-tile--selected" : "",
            isWrong ? "game-tile--incorrect" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={tile.key} className={classes} onClick={() => handleTap(tile)} disabled={isMatched}>
              {tile.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
