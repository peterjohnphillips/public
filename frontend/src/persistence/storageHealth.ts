/**
 * The app has no backend - everything the learner does lives in localStorage
 * (local/db.ts for SRS/session/streak state, persistence/ for resume state) -
 * so a failed write doesn't mean "retry once we're back online", it means
 * "that answer, streak day, or scroll position is gone". This flips on the
 * first failure and stays flipped for the rest of the tab's life, since a
 * quota that's full once tends to stay full.
 */

import { hasStorageWriteFailed } from "./localStore";
import { hasDbWriteFailed } from "../local/db";

export function isStorageHealthy(): boolean {
  return !hasStorageWriteFailed() && !hasDbWriteFailed();
}
