import { useState } from "react";
import { useLesson } from "../../api/lessons";
import { LessonPlayer } from "../lesson/LessonPlayer";
import { Button } from "../ui/Button";

type DifficultyLevel = "all-visible" | "hide-english" | "hide-romanized-too";

const LEVELS: { key: DifficultyLevel; label: string }[] = [
  { key: "all-visible", label: "All text visible" },
  { key: "hide-english", label: "Hide English" },
  { key: "hide-romanized-too", label: "Devanagari only" },
];

/** Reading fluency against modelled pronunciation. Not scored - this is
 * practice, not a quiz - but still worth a session record for streak and
 * time tracking, which LessonPlayer's underlying audio sync provides via the
 * listened-span backend roll-up. Progressively hides English, then
 * romanization too, as a self-test of script fluency. */
export function ReadAlong({ lessonId }: { lessonId?: string | null }) {
  const { data: lesson } = useLesson(lessonId ?? undefined);
  const [level, setLevel] = useState<DifficultyLevel>("all-visible");

  if (!lesson) return <p>Loading...</p>;

  return (
    <div>
      <div className="button-row" style={{ marginBottom: "var(--space-4)" }}>
        {LEVELS.map((l) => (
          <Button key={l.key} variant={level === l.key ? "primary" : "secondary"} onClick={() => setLevel(l.key)}>
            {l.label}
          </Button>
        ))}
      </div>
      <LessonPlayer
        lesson={lesson}
        hideEnglish={level !== "all-visible"}
        hideRomanized={level === "hide-romanized-too"}
      />
    </div>
  );
}
