import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useProgressSummary } from "../api/progress";
import { isStorageHealthy } from "../persistence/storageHealth";

/** A persistent strip showing current streak, vocabulary due today, and
 * minutes practised today. Reads from the cached snapshot (via
 * useProgressSummary's placeholderData) so it never flickers on navigation. */
export function Header() {
  const { data: summary } = useProgressSummary();
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    // There is no server, so "offline" isn't a meaningful state here - the
    // only real failure mode left is local storage itself refusing a write
    // (a full quota, a browser blocking site data). Polled rather than
    // event-driven since there's no storage-write event to listen for.
    const check = () => setStorageOk(isStorageHealthy());
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="app-header">
      <NavLink to="/" className="app-header__brand">
        Nepali Trainer
      </NavLink>
      <nav className="app-header__nav">
        <NavLink to="/lessons" className={({ isActive }) => (isActive ? "active" : "")}>
          Lessons
        </NavLink>
        <NavLink to="/daily" className={({ isActive }) => (isActive ? "active" : "")}>
          Today
        </NavLink>
        <NavLink to="/progress" className={({ isActive }) => (isActive ? "active" : "")}>
          Progress
        </NavLink>
      </nav>
      <div className="app-header__stats">
        {!storageOk && <span className="app-header__offline">Storage is full or blocked - progress isn't saving</span>}
        <span className="app-header__stat">
          Streak <strong>{summary?.streak_days ?? 0}d</strong>
        </span>
        <span className="app-header__stat">
          Due <strong>{summary?.vocab_due_count ?? 0}</strong>
        </span>
        <span className="app-header__stat">
          Today <strong>{summary?.minutes_today ?? 0}m</strong>
        </span>
      </div>
    </header>
  );
}
