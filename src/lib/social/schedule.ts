/**
 * Posting slots in Trinidad & Tobago time (UTC-4, no DST). Default 4/week: Mon, Tue, Thu, Sat at 18:00.
 * weekday: 0=Sun … 6=Sat.
 */
export const TT_UTC_OFFSET_HOURS = -4;
export const DEFAULT_SLOTS = [
  { weekday: 1, hour: 18 },
  { weekday: 2, hour: 18 },
  { weekday: 4, hour: 18 },
  { weekday: 6, hour: 11 },
];

export function slotsForCount(postsPerWeek: number, slots = DEFAULT_SLOTS) {
  if (postsPerWeek <= slots.length) return slots.slice(0, postsPerWeek);
  const extra = [0, 3, 5].map((weekday) => ({ weekday, hour: 18 }));
  return [...slots, ...extra].slice(0, Math.min(7, postsPerWeek)).sort((a, b) => a.weekday - b.weekday);
}

/** Next `count` slot times strictly after `from`, skipping any already-taken ISO times. */
export function nextSlots(count: number, from: Date, slots = DEFAULT_SLOTS, taken: Set<string> = new Set()): Date[] {
  const out: Date[] = [];
  const localNow = new Date(from.getTime() + TT_UTC_OFFSET_HOURS * 3600_000);
  for (let d = 0; out.length < count && d < 60; d++) {
    const day = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + d));
    for (const s of slots.filter((x) => x.weekday === day.getUTCDay()).sort((a, b) => a.hour - b.hour)) {
      const utc = new Date(day.getTime() + (s.hour - TT_UTC_OFFSET_HOURS) * 3600_000);
      if (utc > from && !taken.has(utc.toISOString()) && out.length < count) out.push(utc);
    }
  }
  return out;
}
