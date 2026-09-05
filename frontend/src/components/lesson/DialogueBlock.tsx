import type { PlaybackUnit } from "../../types/content";

interface DialogueBlockProps {
  turns: PlaybackUnit[];
  /** Turns at or after this index are hidden - used by conversation-drilling
   * games to show only the prompt turns and hide the response being built. */
  revealUpTo?: number;
}

/** A plain, non-audio rendering of a dialogue or passage. Used where a
 * lesson's turns need to be shown as reference text without pulling in the
 * full player (e.g. inside a conversation-drill game prompt). */
export function DialogueBlock({ turns, revealUpTo }: DialogueBlockProps) {
  const visible = revealUpTo === undefined ? turns : turns.slice(0, revealUpTo);
  return (
    <div>
      {visible.map((turn) => (
        <div key={turn.turn_index} className="turn-card">
          {turn.speaker && <div className="turn-card__speaker">{turn.speaker}</div>}
          {turn.spans.map((span) => (
            <div key={span.id}>
              <p className="turn-card__line turn-card__line--devanagari devanagari">{span.devanagari}</p>
              <p className="turn-card__line">{span.romanized}</p>
              <p className="turn-card__line turn-card__line--english">{span.english}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
