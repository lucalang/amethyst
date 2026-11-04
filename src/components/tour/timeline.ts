/** Scroll timeline shared by the DOM copy and the 3D scene, measured in viewport heights. */

/** Scroll spent flying from one chapter to the next. */
export const TRAVEL = 2;
// The incoming copy pins this early and the outgoing one stays pinned this long, so both sit still through the crossfade.
const LEAD = 0.35;
const TRAIL = 0.35;

export type Timeline = { starts: number[]; holds: number[]; end: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** `spans` = each chapter's resting scroll plus 1.2 (the last one: plus 1); the flight to the next is added on top. */
export function buildTimeline(spans: number[]): Timeline {
  const starts: number[] = [];
  const holds: number[] = [];
  let at = 0;
  spans.forEach((span, i) => {
    const last = i === spans.length - 1;
    const hold = Math.max(0.4, span - (last ? 1 : 1.2));
    starts.push(at);
    holds.push(hold);
    at += hold + (last ? 0 : TRAVEL);
  });
  return { starts, holds, end: at };
}

/** `x` = chapter index plus travel towards the next; `hold` = progress through the current chapter's pinned beat. */
export function locate({ starts, holds }: Timeline, s: number) {
  const last = starts.length - 1;
  let chapter = 0;
  while (chapter < last && s >= starts[chapter + 1]) chapter++;
  const local = Math.max(0, s - starts[chapter]);
  if (local <= holds[chapter] || chapter === last) return { x: chapter, hold: clamp01(local / holds[chapter]), chapter };
  return { x: chapter + clamp01((local - holds[chapter]) / TRAVEL), hold: 1, chapter };
}

/** Where each chapter's section sits on the page; `anchor` = where its pinned beat begins, relative to `top`. */
export function sectionFrames({ starts, holds, end }: Timeline) {
  const last = starts.length - 1;
  return starts.map((start, i) => {
    const top = i === 0 ? 0 : start - TRAVEL - LEAD;
    const release = i === last ? end : start + holds[i] + TRAVEL + TRAIL;
    return { top, height: release - top + 1, anchor: start - top };
  });
}

/** Copy staging for chapter `i` at visual position `x`: `enter` while arriving, `leave` while flying on. */
export function copyStage(i: number, last: number, x: number) {
  return {
    enter: i === 0 ? 1 : ease((x - (i - 0.55)) / 0.5),
    leave: i === last ? 0 : ease((x - (i + 0.04)) / 0.46),
  };
}
