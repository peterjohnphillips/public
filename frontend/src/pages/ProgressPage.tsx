import {
  useCurriculumPhases,
  useGameModeStats,
  useListeningStats,
  useProgressSummary,
  useStreakCalendar,
  useVocabMastery,
  useWeakestItems,
} from "../api/progress";
import { StreakCalendar } from "../components/progress/StreakCalendar";
import { MasteryBar } from "../components/progress/MasteryBar";
import { Link } from "react-router-dom";

export function ProgressPage() {
  const { data: summary } = useProgressSummary();
  const { data: streak } = useStreakCalendar(70);
  const { data: mastery } = useVocabMastery();
  const { data: gameStats } = useGameModeStats();
  const { data: weakest } = useWeakestItems(20);
  const { data: listening } = useListeningStats();
  const { data: phases } = useCurriculumPhases();

  return (
    <div>
      <h1 className="page-title">Progress</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Streak</h2>
        <p style={{ color: "var(--color-text-muted)" }}>
          Current: {summary?.streak_days ?? 0} days - Longest: {summary?.longest_streak_days ?? 0} days
        </p>
        {streak && <StreakCalendar days={streak} />}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Curriculum</h2>
        <div style={{ display: "flex", overflowX: "auto", gap: "var(--space-2)", paddingBottom: 4 }}>
          {phases?.map((phase) => {
            const isCurrent = summary && summary.curriculum_day >= phase.first_day && summary.curriculum_day <= phase.last_day;
            const isPast = summary && summary.curriculum_day > phase.last_day;
            return (
              <div
                key={phase.key}
                style={{
                  minWidth: 160,
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${isCurrent ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: isPast ? "var(--color-surface-alt)" : "var(--color-surface)",
                  opacity: isPast ? 0.7 : 1,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{phase.label}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{phase.focus}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Vocabulary mastery</h2>
        {mastery && (
          <>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>{mastery.milestone_label}</p>
            {mastery.categories.map((row) => (
              <MasteryBar key={row.category} row={row} />
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Accuracy by game mode</h2>
        {gameStats?.length ? (
          gameStats.map((stat) => (
            <div key={stat.game_mode} className="weak-item-row">
              <span style={{ textTransform: "capitalize" }}>{stat.game_mode.replace(/-/g, " ")}</span>
              <span>
                {stat.accuracy !== null ? `${Math.round(stat.accuracy * 100)}%` : "-"} ({stat.sessions} sessions)
              </span>
            </div>
          ))
        ) : (
          <p className="empty-state">No games played yet.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Weakest items</h2>
        {weakest?.length ? (
          weakest.map((item) => (
            <div key={item.vocab_id} className="weak-item-row">
              <span>
                <span className="devanagari">{item.devanagari}</span> - {item.english}
              </span>
              <Link to={`/games/flashcards`}>Drill</Link>
            </div>
          ))
        ) : (
          <p className="empty-state">Nothing flagged as weak yet - keep reviewing.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Listening</h2>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile__value">{listening?.minutes_listened ?? 0}</div>
            <div className="stat-tile__label">Minutes listened</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile__value">{listening?.passages_completed ?? 0}</div>
            <div className="stat-tile__label">Passages completed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
