"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useSettings } from "@/components/layout/settings-context";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { MediaImage } from "@/components/media/media-image";
import type { CoverShape } from "@/lib/cover-shape";
import { resolveFrame, type ArtworkFrameId } from "@/lib/frames";
import type { FanItem } from "@/lib/home-fan";
import { cn } from "@/lib/utils";

type FanCard = { key: string; title: string; src: string; shape: CoverShape; frame: ArtworkFrameId };

/** Fan items that have artwork to show, with their frame resolved. */
function fanCards(items: FanItem[], accountFrame: ArtworkFrameId): FanCard[] {
  return items.flatMap((item): FanCard[] =>
    item.kind === "image"
      ? [{ key: item.key, title: "Your artwork", src: item.url, shape: item.shape, frame: accountFrame }]
      : item.coverUrl
        ? [{ key: item.key, title: item.title, src: item.coverUrl, shape: item.coverShape, frame: resolveFrame(item.frame, accountFrame) }]
        : [],
  );
}

/** Whether a fan has already dealt in this page session; returning to Home doesn't replay it. */
let dealt = false;

/**
 * The decorative cover fan: the user's hand-picked artwork, left to right in saved order.
 * Pose math lives in CSS (.home-fan in globals.css); this only provides each card's place.
 * Cards are focusable so keyboard users get the same lift as hover, but never navigate.
 */
export function CoverFan({ items, preview = false, className }: { items: FanItem[]; preview?: boolean; className?: string }) {
  const { artworkFrame } = useSettings();
  const [skipDeal] = useState(() => preview || dealt);
  useEffect(() => {
    if (!preview) dealt = true;
  }, [preview]);

  const cards = fanCards(items, artworkFrame);
  if (!cards.length) return null;
  const n = cards.length;
  const center = (n - 1) / 2;
  // Fewer cards open less; the edge angle settles around 15 degrees for a full hand.
  const spread = n === 1 ? 0 : Math.min(15, 4 + 2.75 * (n - 1));

  return (
    <ul
      aria-label={preview ? undefined : "Cover fan"}
      aria-hidden={preview || undefined}
      data-dealt={skipDeal || undefined}
      data-preview={preview || undefined}
      className={cn("home-fan", className)}
      style={{ "--fan-n": n, "--fan-spread": `${spread}deg`, "--fan-swing": Math.sin((spread * Math.PI) / 180) } as CSSProperties}
    >
      {cards.map((card, index) => {
        const t = index - center;
        const u = center ? t / center : 0;
        return (
          <li
            key={card.key}
            tabIndex={preview ? undefined : 0}
            aria-label={preview ? undefined : card.title}
            data-shape={card.shape}
            className="home-fan-slot"
            style={
              {
                "--fan-t": t,
                "--fan-u": u,
                "--fan-au": Math.abs(u),
                "--fan-z": 20 - Math.round(Math.abs(t) * 2),
                "--fan-i": index,
                "--fan-tilt": `${((index * 37) % 7) - 3}deg`,
              } as CSSProperties
            }
          >
            <ArtworkFrame frame={card.frame} className="home-fan-card">
              <span className="home-fan-art">
                <MediaImage src={card.src} alt="" sizes="auto, (min-width: 1024px) 168px, (min-width: 768px) 144px, 124px" fallbackLabel={card.title} priority={!preview && index < 5} />
                <span aria-hidden className="home-fan-shade" />
                <span aria-hidden className="home-fan-gloss" />
              </span>
            </ArtworkFrame>
            {preview ? (
              <span aria-hidden className="home-fan-number">
                {index + 1}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
