import { Link } from "react-router-dom";
import { Button } from "../ui/Button";
import type { SessionFinishResponse } from "../../types/content";

export function GameSummary({ result, backTo = "/daily" }: { result: SessionFinishResponse; backTo?: string }) {
  const pct = result.score !== null ? Math.round(result.score * 100) : null;
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
        <Link to={backTo}>
          <Button variant="primary">Continue</Button>
        </Link>
        <Link to="/progress">
          <Button variant="secondary">View progress</Button>
        </Link>
      </div>
    </div>
  );
}
