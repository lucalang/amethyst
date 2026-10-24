"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Captions, CaptionsOff, ImageOff, X } from "lucide-react";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { MediaImage } from "@/components/media/media-image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArtworkItem } from "./showcase-context";

const TITLES_KEY = "archive:showcase-titles";

function readTitles(): boolean {
  try {
    return localStorage.getItem(TITLES_KEY) !== "off";
  } catch {
    return true;
  }
}

/** The immersive gallery: artwork only, with a minimal toolbar. */
export function ShowcaseGallery({
  name,
  icon,
  items,
  filtered,
  withoutArtwork,
  covered,
  onView,
  onExit,
}: {
  name: string;
  icon: ReactNode;
  items: ArtworkItem[];
  /** True when search or filters hide some of the collection. */
  filtered: boolean;
  /** Entries in the current results that have no artwork to show. */
  withoutArtwork: number;
  /** The artwork viewer is open on top. */
  covered: boolean;
  onView: (entryId: string, opener: HTMLElement) => void;
  onExit: () => void;
}) {
  const [titles, setTitles] = useState(readTitles);
  const exitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => exitRef.current?.focus({ preventScroll: true }), []);

  function toggleTitles() {
    const next = !titles;
    setTitles(next);
    try {
      localStorage.setItem(TITLES_KEY, next ? "on" : "off");
    } catch {}
  }

  return (
    <div
      data-immersive
      role="dialog"
      aria-modal="true"
      aria-labelledby="showcase-title"
      inert={covered}
      className="showcase fixed inset-0 z-[90] overflow-y-auto overscroll-contain animate-in duration-300 fade-in-0"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-background/90 via-background/60 to-transparent px-4 pt-3 pb-6 md:px-8 md:pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg border border-amethyst/25 bg-amethyst/[0.08] text-amethyst [&_svg]:size-4">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground/80 uppercase">
              Showcase{filtered ? " · filtered" : ""}
            </p>
            <h2 id="showcase-title" className="truncate text-base leading-tight font-semibold md:text-lg">
              {name}
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            aria-pressed={titles}
            title={titles ? "Hide titles" : "Show titles"}
            onClick={toggleTitles}
            className="h-10 gap-2 px-3 text-muted-foreground aria-pressed:text-foreground"
          >
            {titles ? <Captions aria-hidden /> : <CaptionsOff aria-hidden />}
            <span className="sr-only sm:not-sr-only">Titles</span>
          </Button>
          <Button ref={exitRef} type="button" variant="outline" onClick={onExit} className="h-10 gap-2 px-3.5 backdrop-blur-md">
            <X aria-hidden /> Exit
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[112rem] px-5 pt-4 pb-24 md:px-12 md:pt-8">
        {items.length > 0 ? (
          <ul className="showcase-grid" aria-label={`${name} artwork`}>
            {items.map((item, index) => (
              <li
                key={item.id}
                className="showcase-item enter enter-card"
                style={{ "--ar": item.coverShape === "square" ? 1 : 2 / 3, "--enter-index": Math.min(index, 8) + 1 } as CSSProperties}
              >
                <button
                  type="button"
                  data-showcase-entry={item.id}
                  aria-label={`View artwork: ${item.title}`}
                  onClick={(event) => onView(item.id, event.currentTarget)}
                  className="showcase-art block w-full cursor-zoom-in rounded-lg"
                >
                  <ArtworkFrame frame={item.frame}>
                    <span className={cn("showcase-pic relative block overflow-hidden rounded-lg bg-surface", item.coverShape === "square" ? "aspect-square" : "aspect-[2/3]")}>
                      <MediaImage src={item.coverUrl} alt="" priority={index < 8} fallbackLabel={item.title} />
                    </span>
                  </ArtworkFrame>
                </button>
                {titles ? (
                  <p className="mt-3.5 truncate px-1 text-center text-sm font-medium text-muted-foreground" title={item.title}>
                    {item.title}
                  </p>
                ) : null}
              </li>
            ))}
            <li aria-hidden className="showcase-filler" />
          </ul>
        ) : (
          <div className="grid min-h-[60dvh] place-items-center text-center">
            <div className="max-w-sm">
              <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-lg border border-white/[0.09] bg-white/[0.03] text-muted-foreground">
                <ImageOff className="size-5" />
              </span>
              <p className="mt-4 text-base font-semibold">No artwork to show</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {filtered ? "None of the entries matching your filters have artwork." : "Add cover artwork to entries in this collection to see them here."}
              </p>
            </div>
          </div>
        )}
        {items.length > 0 && withoutArtwork > 0 ? (
          <p className="mt-16 text-center text-xs text-muted-foreground/80">
            {withoutArtwork === 1 ? "1 entry without artwork isn’t shown." : `${withoutArtwork} entries without artwork aren’t shown.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
