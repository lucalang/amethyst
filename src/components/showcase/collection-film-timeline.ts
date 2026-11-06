/** The showcase's timeline, shared by the 3D scene and the still (DOM) presentation. */

import type { FrameLookId } from "@/lib/frames";

export type FilmSlide = {
  id: string;
  title: string;
  /** Stored cover value (upload path or remote URL); null draws a title card. */
  coverUrl: string | null;
  square: boolean;
  /** The entry's artwork frame (its own, else the account default). */
  frame: FrameLookId;
  /** Short lines under the title: progress, labels, pinned. */
  meta: string[];
  href: string;
};

/** Seconds per segment: the opening, each entry, and the finale. */
export const FILM = { intro: 7.5, entry: 2.1, outro: 9, transition: 1.6 } as const;

/**
 * Playback state. Segment 0 is the opening, 1..count the entries in order, count + 1 the finale.
 * `t` is seconds into the current segment.
 */
export type Director = { seg: number; t: number; playing: boolean; count: number };

export const segmentLength = (director: Director, seg = director.seg) => (seg === 0 ? FILM.intro : seg > director.count ? FILM.outro : FILM.entry);
export const lastSegment = (director: Director) => director.count + 1;

/**
 * Advances the clock; returns true when the segment changed or playback ended. While paused, a
 * segment that was just entered still plays up to `settle` seconds, so stepping shows its arrival.
 */
export function tick(director: Director, dt: number, settle: number): boolean {
  if (!director.playing) {
    if (director.t < settle) director.t = Math.min(settle, director.t + dt);
    return false;
  }
  director.t += dt;
  const length = segmentLength(director);
  if (director.t < length) return false;
  if (director.seg < lastSegment(director)) {
    director.seg += 1;
    director.t = 0;
  } else {
    director.t = length;
    director.playing = false;
  }
  return true;
}

export function seek(director: Director, seg: number) {
  director.seg = Math.max(0, Math.min(lastSegment(director), seg));
  director.t = 0;
}

/** Evenly spread picks across the collection for the opening and finale, artwork first. */
export function sampleSlides(slides: FilmSlide[], limit: number): number[] {
  const withArt = slides.flatMap((slide, index) => (slide.coverUrl ? [index] : []));
  const pool = withArt.length >= Math.min(limit, slides.length) ? withArt : slides.map((_, index) => index);
  if (pool.length <= limit) return pool;
  return Array.from({ length: limit }, (_, index) => pool[Math.floor((index * pool.length) / limit)]);
}
