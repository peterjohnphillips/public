import { useParams, Link } from "react-router-dom";
import { useLesson, useCompleteLesson } from "../api/lessons";
import { VocabList } from "../components/lesson/VocabList";
import { SentencePatternCard } from "../components/lesson/SentencePatternCard";
import { LessonPlayer } from "../components/lesson/LessonPlayer";
import { Button } from "../components/ui/Button";
import { ProgressRing } from "../components/ui/ProgressRing";

const GAME_LINKS: { mode: string; label: string }[] = [
  { mode: "fill-in-blank", label: "Fill in the Blank" },
  { mode: "sentence-scramble", label: "Sentence Scramble" },
  { mode: "sentence-builder", label: "Sentence Builder" },
  { mode: "listening-comprehension", label: "Listening Comprehension" },
  { mode: "listening-transcription", label: "Listening Transcription" },
  { mode: "read-along", label: "Read Along" },
];

export function LessonView() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { data: lesson, isLoading } = useLesson(lessonId);
  const completeLesson = useCompleteLesson();

  if (isLoading) return <p>Loading lesson...</p>;
  if (!lesson) return <p className="empty-state">Lesson not found.</p>;

  const completionFraction = lesson.progress_status === "completed" ? 1 : lesson.progress_status === "in_progress" ? 0.5 : 0;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
        <ProgressRing fraction={completionFraction} />
        <h1 className="page-title" style={{ margin: 0 }}>{lesson.title}</h1>
        {lesson.status === "stub" && <span className="badge badge--stub">stub - no content yet</span>}
      </div>
      <p style={{ color: "var(--color-text-muted)" }}>
        Week {lesson.week}{lesson.day ? `, Day ${lesson.day}` : ""} - {lesson.skill_type}
      </p>

      {lesson.notes_markdown && (
        <div className="card">
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{lesson.notes_markdown}</pre>
        </div>
      )}

      {lesson.patterns.length > 0 && (
        <section style={{ marginTop: "var(--space-5)" }}>
          <h2>Sentence Patterns</h2>
          {lesson.patterns.map((pattern) => (
            <SentencePatternCard key={pattern.id} pattern={pattern} />
          ))}
        </section>
      )}

      {lesson.vocab.length > 0 && (
        <section style={{ marginTop: "var(--space-5)" }}>
          <h2>Vocabulary</h2>
          <VocabList items={lesson.vocab} />
        </section>
      )}

      {lesson.turns.length > 0 && (
        <section style={{ marginTop: "var(--space-5)" }}>
          <h2>{lesson.is_dialogue ? "Dialogue" : "Passage"}</h2>
          <LessonPlayer lesson={lesson} />
        </section>
      )}

      <section style={{ marginTop: "var(--space-5)" }}>
        <h2>Practice</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {GAME_LINKS.map((link) => (
            <Link key={link.mode} to={`/games/${link.mode}?lesson=${lesson.id}`}>
              <Button variant="secondary">{link.label}</Button>
            </Link>
          ))}
        </div>
      </section>

      {lesson.progress_status !== "completed" && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <Button variant="primary" onClick={() => completeLesson.mutate({ lessonId: lesson.id, minutes: lesson.estimated_minutes ?? 20 })}>
            Mark lesson complete
          </Button>
        </div>
      )}
    </div>
  );
}
