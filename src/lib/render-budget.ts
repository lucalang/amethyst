const MAX_RENDER_PIXELS = 5_000_000;
const MIN_RENDER_PIXEL_RATIO = 0.75;

/** Limit oversized WebGL buffers while preserving the renderer's normal DPR cap. */
export function renderPixelRatio(width: number, height: number, devicePixelRatio: number, maxRatio: number) {
  const ratio = Math.min(devicePixelRatio || 1, maxRatio);
  if (width <= 0 || height <= 0 || width * height * ratio * ratio <= MAX_RENDER_PIXELS) return ratio;
  return Math.min(ratio, Math.max(MIN_RENDER_PIXEL_RATIO, Math.sqrt(MAX_RENDER_PIXELS / (width * height))));
}

const SCALES = [1, 0.85, 0.72, 0.6];

/**
 * Lowers a scene's render scale only while its frames run slow (median under ~45 fps) and restores it
 * once they are fast again, so capable devices keep full resolution. Call `tick` on every rAF callback.
 */
export function createFrameGovernor(onChange: () => void) {
  let step = 0;
  let prev = 0;
  let windowStart = 0;
  let upAt = 0;
  let raisedAt = -Infinity;
  let backoff = 8000;
  const gaps: number[] = [];
  return {
    get scale() {
      return SCALES[step];
    },
    tick(now: number) {
      const gap = prev ? now - prev : 0;
      prev = now;
      // Pauses (sleeping loop, hidden tab) and one-off stalls such as shader compiles say nothing about steady speed.
      if (!gap || gap > 250) {
        windowStart = 0;
        gaps.length = 0;
        return;
      }
      if (!windowStart) windowStart = now;
      gaps.push(gap);
      if (now - windowStart < 1500 || gaps.length < 20) return;
      gaps.sort((a, b) => a - b);
      const median = gaps[gaps.length >> 1];
      gaps.length = 0;
      windowStart = now;
      if (median > 22 && step < SCALES.length - 1) {
        // Slow right after going back up: wait longer before the next try.
        backoff = now - raisedAt < 4000 ? Math.min(backoff * 2, 120_000) : 8000;
        step++;
        upAt = now + backoff;
        onChange();
      } else if (median < 18 && step > 0 && now >= upAt) {
        step--;
        raisedAt = now;
        upAt = now + 4000;
        onChange();
      }
    },
  };
}