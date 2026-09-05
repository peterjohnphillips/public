import { Link } from "react-router-dom";
import { useLessons } from "../api/lessons";

export function LessonList() {
  const { data: lessons, isLoading } = useLessons();

  if (isLoading) return <p>Loading lessons...</p>;

  return (
    <div>
      <h1 className="page-title">Lessons</h1>
      <div className="lesson-list">
        {lessons?.map((lesson) => (
          <Link key={lesson.id} to={`/lessons/${lesson.id}`} className="lesson-card">
            <div className="lesson-card__meta">
              <p className="lesson-card__title">{lesson.title}</p>
              <div className="lesson-card__sub">
                <span>Week {lesson.week}{lesson.day ? `, Day ${lesson.day}` : ""}</span>
                <span>{lesson.skill_type}</span>
                {lesson.status === "stub" && <span className="badge badge--stub">stub</span>}
                {lesson.progress_status === "completed" && <span className="badge badge--done">completed</span>}
                {lesson.due_vocab_count > 0 && <span className="badge badge--due">{lesson.due_vocab_count} due</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
