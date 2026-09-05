import { useParams, useSearchParams, Link } from "react-router-dom";
import { getGameMode } from "../components/games/registry";
import { Button } from "../components/ui/Button";

export function GameHostPage() {
  const { mode } = useParams<{ mode: string }>();
  const [searchParams] = useSearchParams();
  const lessonId = searchParams.get("lesson") || null;

  const gameMode = mode ? getGameMode(mode) : undefined;

  if (!gameMode) {
    return (
      <div>
        <p className="empty-state">Unknown game mode "{mode}".</p>
        <Link to="/daily">
          <Button variant="secondary">Back to today</Button>
        </Link>
      </div>
    );
  }

  if (gameMode.requiresLesson && !lessonId) {
    return (
      <div>
        <p className="empty-state">{gameMode.label} needs a lesson to draw content from. Open it from a lesson page.</p>
        <Link to="/lessons">
          <Button variant="secondary">Browse lessons</Button>
        </Link>
      </div>
    );
  }

  const Component = gameMode.component;
  return (
    <div>
      <h1 className="page-title">{gameMode.label}</h1>
      <Component lessonId={lessonId} />
    </div>
  );
}
