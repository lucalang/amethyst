/**
 * Daily challenges: one seed per UTC day, shared by everyone. A new challenge starts at 00:00 UTC.
 * Daily bests are saved as the record variant `daily-YYYY-MM-DD`, apart from regular play.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_VARIANT = /^daily-(\d{4}-\d{2}-\d{2})$/;

/** Today's challenge date (UTC), e.g. "2026-11-03". */
export function dailyDate(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Milliseconds until the next challenge starts (00:00 UTC). */
export function msUntilDailyReset(now = Date.now()) {
  return DAY_MS - (now % DAY_MS);
}

export const dailyVariant = (date: string) => `daily-${date}`;

/**
 * Whether a record variant is a daily challenge the server still accepts: today's, or yesterday's
 * for a run that started before midnight and kept its original date.
 */
export function isRecentDailyVariant(variant: string, now = Date.now()) {
  const match = DAILY_VARIANT.exec(variant);
  if (!match) return false;
  return match[1] === dailyDate(now) || match[1] === dailyDate(now - DAY_MS);
}

/** A 32-bit seed from a text key (FNV-1a), e.g. "2048:2026-11-03". */
export function seedFrom(key: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One step of mulberry32: a number in [0, 1) and the next state. The state is a plain uint32 so it can be saved. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** A seeded random number generator (mulberry32) returning numbers in [0, 1). */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    const step = nextRandom(state);
    state = step.state;
    return step.value;
  };
}
