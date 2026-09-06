import { useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useLesson, useCompleteLesson } from "../api/lessons";
import { VocabList } from "../components/lesson/VocabList";
import { SentencePatternCard } from "../components/lesson/SentencePatternCard";
import { LessonPlayer } from "../components/lesson/LessonPlayer";
import { Button } from "../components/ui/Button";
import { ProgressRing } from "../components/ui/ProgressRing";
import { readAudioRecord } from "../persistence/audioStore";
import { isLessonPositionFresh, readLessonPosition, writeLessonPosition } from "../persistence/lessonStore";
import type { LessonPositionRecord } from "../persistence/schema";

type SectionKey = LessonPositionRecord["section"];

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

  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});
  const activeSectionRef = useRef<SectionKey | null>(null);
  // Tracks which lesson's scroll position has already been restored, since
  // navigating between lessons keeps this component mounted rather than
  // remounting it - a plain boolean would only ever restore the first lesson.
  const restoredForLessonId = useRef<string | null>(null);

  // Restore scroll position once per lesson, after its sections have
  // rendered - a fresh position beats starting back at the top every time you
  // reopen a lesson you were partway through.
  useEffect(() => {
    if (!lesson || restoredForLessonId.current === lesson.id) return;
    restoredForLessonId.current = lesson.id;
    const stored = readLessonPosition(lesson.id);
    if (stored && isLessonPositionFresh(stored)) {
      requestAnimationFrame(() => window.scrollTo({ top: stored.scrollY }));
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [lesson]);

  // Tracks the topmost visible section as the user scrolls, and journals it
  // (debounced) so closing the tab mid-lesson doesn't lose the spot.
  useEffect(() => {
    if (!lesson) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target as HTMLElement | undefined;
        const section = top?.dataset.section as SectionKey | undefined;
        if (section) activeSectionRef.current = section;
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    for (const el of Object.values(sectionRefs.current)) {
      if (el) observer.observe(el);
    }

    const onScroll = () => {
      if (!activeSectionRef.current) return;
      writeLessonPosition({
        version: 1,
        lessonId: lesson.id,
        section: activeSectionRef.current,
        scrollY: window.scrollY,
        updatedAt: new Date().toISOString(),
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [lesson]);

  if (isLoading) return <p>Loading lesson...</p>;
  if (!lesson) return <p className="empty-state">Lesson not found.</p>;

  const setSectionRef = (section: SectionKey) => (el: HTMLElement | null) => {
    sectionRefs.current[section] = el;
  };
  const audioPosition = readAudioRecord(lesson.id);
  const resumeSpan = audioPosition && !audioPosition.isComplete
    ? { turnIndex: audioPosition.turnIndex, spanIndex: audioPosition.spanIndex }
    : null;

  return (
    <div>
      <div ref={setSectionRef("notes")} data-section="notes" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
        <ProgressRing fraction={lesson.progress_fraction} />
        <h1 className="page-title" style={{ margin: 0 }}>{lesson.title}</h1>
        {lesson.status === "stub" && <span className="badge badge--stub">stub - no content yet</span>}
      </div>
      <p style={{ color: "var(--color-text-muted)" }}>
        Week {lesson.week}{lesson.day ? `, Day ${lesson.day}` : ""} - {lesson.skill_type}
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0", display: "flex", flexDirection: "column", gap: "4px" }}>
        {lesson.milestones.map((m) => (
          <li key={m.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.85rem", color: m.done ? "var(--color-text)" : "var(--color-text-muted)" }}>
            <span aria-hidden="true">{m.done ? "✓" : "○"}</span>
            <span>{m.label}</span>
            {m.detail && <span style={{ color: "var(--color-text-muted)" }}>({m.detail})</span>}
          </li>
        ))}
      </ul>

      {lesson.notes_markdown && (
        <div className="card">
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{lesson.notes_markdown}</pre>
        </div>
      )}

      {lesson.patterns.length > 0 && (
        <section ref={setSectionRef("patterns")} data-section="patterns" style={{ marginTop: "var(--space-5)" }}>
          <h2>Sentence Patterns</h2>
          {lesson.patterns.map((pattern) => (
            <SentencePatternCard key={pattern.id} pattern={pattern} />
          ))}
        </section>
      )}

      {lesson.vocab.length > 0 && (
        <section ref={setSectionRef("vocab")} data-section="vocab" style={{ marginTop: "var(--space-5)" }}>
          <h2>Vocabulary</h2>
          <VocabList items={lesson.vocab} />
        </section>
      )}

      {lesson.turns.length > 0 && (
        <section ref={setSectionRef("passage")} data-section="passage" style={{ marginTop: "var(--space-5)" }}>
          <h2>{lesson.is_dialogue ? "Dialogue" : "Passage"}</h2>
          <LessonPlayer lesson={lesson} resumeSpan={resumeSpan} />
        </section>
      )}

      <section ref={setSectionRef("practice")} data-section="practice" style={{ marginTop: "var(--space-5)" }}>
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
