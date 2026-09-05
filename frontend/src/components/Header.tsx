import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useProgressSummary } from "../api/progress";

/** A persistent strip showing current streak, vocabulary due today, and
 * minutes practised today. Reads from the cached snapshot (via
 * useProgressSummary's placeholderData) so it never flickers on navigation. */
export function Header() {
  const { data: summary } = useProgressSummary();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
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
        {offline && <span className="app-header__offline">Backend unreachable - answers will sync later</span>}
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
