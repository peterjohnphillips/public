interface ProgressBarProps {
  fraction: number; // 0..1
  label?: string;
}

export function ProgressBar({ fraction, label }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div>
      {label && <div style={{ fontSize: "0.8rem", marginBottom: 4, color: "var(--color-text-muted)" }}>{label}</div>}
      <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
