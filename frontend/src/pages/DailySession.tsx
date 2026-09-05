import { useEffect, useState } from "react";
import { useProgressSummary } from "../api/progress";
import { useLessons } from "../api/lessons";
import { activitiesForPhase, type DailyActivity } from "../dailySessionConfig";
import { getGameMode } from "../components/games/registry";
import { readDailySession, startDailySession, advanceDailySession } from "../persistence/dailySessionStore";
import { Button } from "../components/ui/Button";
import { ProgressBar } from "../components/ui/ProgressBar";

/** Assembles a mixed practice queue matching the current curriculum phase,
 * driven by the static config in dailySessionConfig.ts. Position within the
 * queue is tracked in local storage so a multi-activity session survives
 * being closed between activities. */
export function DailySession() {
  const { data: summary } = useProgressSummary();
  const { data: lessons } = useLessons();
  const [activityIndex, setActivityIndex] = useState(0);

  const phaseKey = phaseKeyForDay(summary?.curriculum_day ?? 1);
  const activities = activitiesForPhase(phaseKey);

  useEffect(() => {
    const existing = readDailySession();
    if (existing && existing.totalActivities === activities.length) {
      setActivityIndex(existing.activityIndex);
    } else {
      const started = startDailySession(activities.length);
      setActivityIndex(started.activityIndex);
    }
    // Only re-run if the activity count for the phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities.length]);

  if (!summary || !lessons) return <p>Loading today's session...</p>;

  if (activityIndex >= activities.length) {
    return (
      <div className="card session-summary">
        <p style={{ fontSize: "1.2rem", fontWeight: 600 }}>Today's session is complete.</p>
        <p style={{ color: "var(--color-text-muted)" }}>Come back tomorrow, or review anything still due.</p>
      </div>
    );
  }

  const activity = activities[activityIndex];
  const lessonId = resolveLessonId(activity, lessons, summary.curriculum_day);
  const gameMode = getGameMode(activity.mode);

  const next = () => {
    const updated = advanceDailySession();
    setActivityIndex(updated?.activityIndex ?? activityIndex + 1);
  };

  if (!gameMode) return <p>Unknown activity "{activity.mode}".</p>;

  const Component = gameMode.component;

  return (
    <div>
      <h1 className="page-title">Today's Session</h1>
      <ProgressBar
        fraction={activityIndex / activities.length}
        label={`Activity ${activityIndex + 1} of ${activities.length}: ${gameMode.label}`}
      />
      <div style={{ margin: "var(--space-4) 0" }}>
        <Component lessonId={lessonId} />
      </div>
      <Button variant="secondary" onClick={next}>
        Skip to next activity
      </Button>
    </div>
  );
}

function phaseKeyForDay(day: number): string {
  if (day <= 3) return "days-1-3";
  if (day <= 7) return "days-4-7";
  if (day <= 14) return "week-2";
  if (day <= 21) return "week-3";
  return "week-4";
}

function resolveLessonId(
  activity: DailyActivity,
  lessons: ReturnType<typeof useLessons>["data"],
  curriculumDay: number,
): string | null {
  if (activity.lessonHint === "script") return "script-devanagari";
  if (activity.lessonHint === "current-day") {
    const forToday = lessons?.find((l) => l.day === curriculumDay && l.status !== "stub");
    if (forToday) return forToday.id;
    // Fall back to any lesson with real content so the activity isn't stuck
    // on an empty stub before real curriculum content is authored.
    const anyWithContent = lessons?.find((l) => l.status !== "stub" && (l.vocab_count > 0 || l.span_count > 0));
    return anyWithContent?.id ?? null;
  }
  return null;
}
