"use client";

import { useState } from "react";
import { artworkSrc, artworkVariantSrc } from "@/lib/attachments";
import type { Moment } from "@/lib/time-machine";

const WIDTH = 768;

/** Where a moment's artwork loads from (null: it has none we can show). The same URL is what gets preloaded. */
export const storyArtSrc = (moment: Pick<Moment, "coverUrl">) => (moment.coverUrl && artworkSrc(moment.coverUrl) ? artworkVariantSrc(moment.coverUrl, WIDTH) : null);

const preloaded = new Set<string>();
/** Warms the browser cache for artwork the next scenes will show. */
export function preloadArt(moments: Pick<Moment, "coverUrl">[]) {
  for (const moment of moments) {
    const src = storyArtSrc(moment);
    if (!src || preloaded.has(src)) continue;
    preloaded.add(src);
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }
}

/** A real cover from the archive, or a tile with the entry's initial when it has none. */
export function StoryArt({ moment }: { moment: Pick<Moment, "coverUrl" | "title"> }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : storyArtSrc(moment);
  if (!src) {
    return (
      <span className="rw-art rw-art-fallback" aria-hidden>
        <b>{Array.from(moment.title.trim())[0]?.toUpperCase() ?? "?"}</b>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- served by the authenticated artwork proxy, not next/image
  return <img className="rw-art" src={src} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}
