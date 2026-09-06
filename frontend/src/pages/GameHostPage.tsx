import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { getGameMode } from "../components/games/registry";
import { GameContainerProvider } from "../components/games/GameContainerContext";
import { Button } from "../components/ui/Button";

export function GameHostPage() {
  const { mode } = useParams<{ mode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const onContinue = () => navigate(lessonId ? `/lessons/${lessonId}` : "/");
  const continueLabel = lessonId ? "Back to lesson" : "Done";

  return (
    <div>
      <h1 className="page-title">{gameMode.label}</h1>
      <GameContainerProvider value={{ onContinue, continueLabel }}>
        <Component lessonId={lessonId} />
      </GameContainerProvider>
    </div>
  );
}
