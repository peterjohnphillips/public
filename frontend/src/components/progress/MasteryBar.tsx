import type { CategoryMastery } from "../../types/content";

/** Stacked bar per category, split into the four mastery buckets, so the
 * user can see whether vocabulary is keeping up with the curriculum's word
 * milestones. */
export function MasteryBar({ row, target }: { row: CategoryMastery; target?: number }) {
  const total = Math.max(row.total, target ?? 0, 1);
  const segment = (count: number) => `${(count / total) * 100}%`;

  return (
    <div className="category-row">
      <div className="category-row__label">{row.category}</div>
      <div className="category-row__bar" title={`${row.total} words`}>
        <div style={{ width: segment(row.mature), background: "var(--color-mastery-mature)" }} />
        <div style={{ width: segment(row.young), background: "var(--color-mastery-young)" }} />
        <div style={{ width: segment(row.learning), background: "var(--color-mastery-learning)" }} />
        <div style={{ width: segment(row.new), background: "var(--color-mastery-new)" }} />
      </div>
      <div style={{ minWidth: 48, flexShrink: 0, whiteSpace: "nowrap", textAlign: "right", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
        {row.total}
        {target ? `/${target}` : ""}
      </div>
    </div>
  );
}
