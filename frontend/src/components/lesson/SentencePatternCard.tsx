import type { SentencePattern } from "../../types/content";

export function SentencePatternCard({ pattern }: { pattern: SentencePattern }) {
  return (
    <div className="card" style={{ marginBottom: "var(--space-3)" }}>
      <p className="devanagari" style={{ fontSize: "1.2rem", margin: "0 0 4px" }}>
        {pattern.template_devanagari}
      </p>
      <p style={{ margin: "0 0 12px", color: "var(--color-text-muted)" }}>
        {pattern.template_romanized} - {pattern.template_english}
      </p>
      {pattern.examples.map((example, i) => (
        <div key={i} style={{ marginBottom: 6, paddingLeft: "var(--space-3)", borderLeft: "2px solid var(--color-border)" }}>
          <div className="devanagari">{example.devanagari}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {example.romanized} - {example.english}
          </div>
        </div>
      ))}
    </div>
  );
}
