import type { MasteryBucket } from "../../types/content";

export function MasteryDot({ bucket }: { bucket: MasteryBucket }) {
  return <span className={`mastery-dot mastery-dot--${bucket}`} title={`Mastery: ${bucket}`} />;
}
