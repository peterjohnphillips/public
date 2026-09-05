import type { StreakDay } from "../../types/content";

interface StreakCalendarProps {
  days: StreakDay[];
}

function intensity(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 90) return 2;
  if (minutes < 150) return 3;
  return 4;
}

const LEVEL_COLOR = [
  "var(--color-surface-alt)",
  "color-mix(in srgb, var(--color-accent) 30%, var(--color-surface-alt))",
  "color-mix(in srgb, var(--color-accent) 55%, var(--color-surface-alt))",
  "color-mix(in srgb, var(--color-accent) 80%, var(--color-surface-alt))",
  "var(--color-accent)",
];

/** A heatmap of the last several weeks, each cell shaded by minutes active. */
export function StreakCalendar({ days }: StreakCalendarProps) {
  return (
    <div className="heatmap">
      {days.map((day) => {
        const level = intensity(day.minutes_active);
        return (
          <div
            key={day.date}
            className="heatmap__cell"
            style={{ background: LEVEL_COLOR[level] }}
            title={`${day.date}: ${day.minutes_active} min, ${day.sessions_completed} sessions`}
          />
        );
      })}
    </div>
  );
}
