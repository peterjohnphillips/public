import { Button } from "../ui/Button";
import { useGameContainer } from "./GameContainerContext";
import { useNavigate } from "react-router-dom";
import type { SessionFinishResponse } from "../../types/content";

export function GameSummary({ result }: { result: SessionFinishResponse }) {
  const pct = result.score !== null ? Math.round(result.score * 100) : null;
  const { onContinue, continueLabel } = useGameContainer();
  const navigate = useNavigate();
  return (
    <div className="card session-summary">
      <p style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>Session complete</p>
      <div className="session-summary__score">{pct !== null ? `${pct}%` : "Done"}</div>
      <p>
        {result.correct_items} / {result.total_items} correct
        {result.duration_seconds != null && ` in ${Math.round(result.duration_seconds / 60)} min`}
      </p>
      {result.streak_days > 0 && <p>Streak: {result.streak_days} day{result.streak_days === 1 ? "" : "s"}</p>}
      <div className="button-row" style={{ justifyContent: "center", marginTop: "var(--space-4)" }}>
        <Button variant="primary" onClick={onContinue}>
          {continueLabel}
        </Button>
        <Button variant="secondary" onClick={() => navigate("/progress")}>
          View progress
        </Button>
      </div>
    </div>
  );
}
