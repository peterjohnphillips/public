import { useState } from "react";
import { useTts } from "../../tts/useTts";
import { VoicePicker } from "../ui/VoicePicker";
import { ProgressBar } from "../ui/ProgressBar";
import { Button } from "../ui/Button";
import type { Lesson } from "../../types/content";

interface LessonPlayerProps {
  lesson: Lesson;
  /** Independently hideable lines, used by the read-along game to step up
   * difficulty: all visible, then English hidden, then romanization too. */
  hideEnglish?: boolean;
  hideRomanized?: boolean;
  resumeSpan?: { turnIndex: number; spanIndex: number } | null;
}

/** Shared by plain lesson viewing and the read-along game, which just wraps
 * this with a scoring layer and forces the hide flags on. Renders turns as
 * stacked cards and highlights whichever span is currently speaking. */
export function LessonPlayer({ lesson, hideEnglish, hideRomanized, resumeSpan }: LessonPlayerProps) {
  const tts = useTts(lesson.id, lesson.turns);
  const [started, setStarted] = useState(false);

  if (lesson.turns.length === 0) {
    return <p className="empty-state">No dialogue or passage content yet for this lesson.</p>;
  }

  const handlePlay = () => {
    setStarted(true);
    tts.play(resumeSpan && !started ? resumeSpan : undefined);
  };

  return (
    <div>
      <div className="player-controls">
        {!tts.isPlaying ? (
          <Button variant="primary" onClick={handlePlay}>
            {resumeSpan ? "Resume" : "Play"}
          </Button>
        ) : (
          <Button variant="primary" onClick={tts.pause}>
            Pause
          </Button>
        )}
        <Button variant="secondary" onClick={tts.stop}>
          Stop
        </Button>
        <VoicePicker
          voices={tts.voices}
          voiceAvailable={tts.voiceAvailable}
          useFallbackVoice={tts.useFallbackVoice}
          selectedURI={tts.voiceURI}
          onSelect={tts.setVoiceURI}
          onToggleFallback={tts.setUseFallbackVoice}
          rate={tts.rate}
          onRateChange={tts.setRate}
        />
      </div>

      <ProgressBar fraction={tts.progressFraction} label="Listened" />

      <div style={{ marginTop: "var(--space-4)" }}>
        {lesson.turns.map((turn) => {
          const isActiveTurn = tts.currentSpan?.turnIndex === turn.turn_index;
          return (
            <div key={turn.turn_index} className={`turn-card ${isActiveTurn ? "turn-card--active" : ""}`}>
              {turn.speaker && <div className="turn-card__speaker">{turn.speaker}</div>}
              {turn.spans.map((span) => {
                const isActiveSpan = isActiveTurn && tts.currentSpan?.spanIndex === span.span_index;
                const isListened = tts.listenedSpanIds.has(span.id);
                return (
                  <div key={span.id}>
                    <p className={`turn-card__line turn-card__line--devanagari devanagari ${isActiveSpan ? "span--active" : ""} ${isListened ? "span--listened" : ""}`}>
                      {span.devanagari}
                    </p>
                    {!hideRomanized && <p className="turn-card__line">{span.romanized}</p>}
                    {!hideEnglish && <p className="turn-card__line turn-card__line--english">{span.english}</p>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
