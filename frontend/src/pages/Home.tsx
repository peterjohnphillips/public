import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProgressSummary } from "../api/progress";
import { useLessons } from "../api/lessons";
import { resolveResumeTarget, type ResumeTarget } from "../persistence/resume";
import { ResumeCard } from "../components/progress/ResumeCard";
import { Button } from "../components/ui/Button";
import { ProgressBar } from "../components/ui/ProgressBar";

export function Home() {
  const { data: summary } = useProgressSummary();
  const { data: lessons } = useLessons();
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget | null>(null);

  useEffect(() => {
    setResumeTarget(resolveResumeTarget());
  }, []);

  const currentDayLesson = lessons?.find((l) => l.day === summary?.curriculum_day && l.status !== "stub");

  return (
    <div>
      <h1 className="page-title">Home</h1>

      {summary?.content_is_placeholder && (
        <div className="error-banner">
          Lesson content is still placeholder/stub material. Real curriculum content hasn't been authored yet -
          see <code>docs/content-authoring-guide.md</code> to write it.
        </div>
      )}

      {resumeTarget && <ResumeCard target={resumeTarget} />}

      <div className="card">
        <p style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>
          Day {summary?.curriculum_day ?? 1} - Week {summary?.curriculum_week ?? 1}
        </p>
        <h2 style={{ margin: "0 0 8px" }}>{summary?.week_focus ?? "Loading..."}</h2>
        <ProgressBar
          fraction={summary ? summary.vocab_introduced / Math.max(summary.vocab_total, 1) : 0}
          label={`Vocabulary introduced: ${summary?.vocab_introduced ?? 0} / ${summary?.vocab_total ?? 0}`}
        />
        <div className="button-row" style={{ marginTop: "var(--space-4)" }}>
          <Link to="/daily">
            <Button variant="primary">Start today's session</Button>
          </Link>
          {currentDayLesson && (
            <Link to={`/lessons/${currentDayLesson.id}`}>
              <Button variant="secondary">Open today's lesson</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="stat-grid" style={{ marginTop: "var(--space-4)" }}>
        <div className="card stat-tile">
          <div className="stat-tile__value">{summary?.streak_days ?? 0}</div>
          <div className="stat-tile__label">Day streak</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-tile__value">{summary?.vocab_due_count ?? 0}</div>
          <div className="stat-tile__label">Vocab due today</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-tile__value">{summary?.minutes_today ?? 0}</div>
          <div className="stat-tile__label">Minutes today</div>
        </div>
        <div className="card stat-tile">
          <div className="stat-tile__value">
            {summary?.lessons_completed ?? 0}/{summary?.lessons_with_content ?? 0}
          </div>
          <div className="stat-tile__label">
            Lessons completed
            {(summary?.lessons_in_progress ?? 0) > 0 && ` (${summary?.lessons_in_progress} in progress)`}
          </div>
        </div>
      </div>
    </div>
  );
}
