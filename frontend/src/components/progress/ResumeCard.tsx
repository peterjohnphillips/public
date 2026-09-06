import { Link } from "react-router-dom";
import type { ResumeTarget } from "../../persistence/resume";
import { describeResumeTarget } from "../../persistence/resume";
import { Button } from "../ui/Button";

interface ResumeCardProps {
  target: ResumeTarget;
}

function resumeLink(target: ResumeTarget): string {
  switch (target.kind) {
    case "session":
      return `/games/${target.record.gameMode}?lesson=${target.record.lessonId ?? ""}`;
    case "audio":
      return `/lessons/${target.record.lessonId}`;
    case "lesson":
      return `/lessons/${target.record.lessonId}`;
    case "daily":
      return "/daily";
  }
}

/** One card, not a list, so there is always a single obvious next action. */
export function ResumeCard({ target }: ResumeCardProps) {
  return (
    <div className="card resume-card">
      <div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
          Pick up where you left off
        </div>
        <div style={{ fontWeight: 600 }}>{describeResumeTarget(target)}</div>
      </div>
      <Link to={resumeLink(target)}>
        <Button variant="primary">Continue</Button>
      </Link>
    </div>
  );
}
