/** Exponential backoff with full jitter, capped. attempt is 1-based. */
export function backoffSeconds(attempt: number, baseSec = 30, capSec = 6 * 60 * 60, random = Math.random): number {
  const exp = Math.min(capSec, baseSec * 2 ** Math.max(0, attempt - 1));
  return Math.max(baseSec, Math.round(exp * (0.5 + random() * 0.5)));
}

/** A handler can ask to be re-run later without counting as a failure (e.g. IG container still processing). */
export class Reschedule extends Error {
  constructor(public seconds: number, reason = "rescheduled") {
    super(reason);
    this.name = "Reschedule";
  }
}
