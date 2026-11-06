"use client";

import { useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Clapperboard } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { useLibrary } from "@/components/media/library-view";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { entryPath } from "@/lib/collections";
import { resolveFrame, type ArtworkFrameId } from "@/lib/frames";
import { entryProgress, type LibraryEntry } from "@/lib/progress/library";
import { overlayHost } from "./showcase-provider";
import type { FilmSlide } from "./collection-film-timeline";

const CollectionFilmPlayer = dynamic(() => import("./collection-film-player"), {
  ssr: false,
  loading: () => (
    <div className="cf cf-loading" data-immersive role="status">
      Preparing showcase…
    </div>
  ),
});

function toSlide(entry: LibraryEntry, labelNames: Record<string, string>, accountFrame: ArtworkFrameId): FilmSlide {
  const progress = entryProgress(entry);
  const meta: string[] = [];
  if (progress.total) meta.push(`${progress.done}/${progress.total} ${progress.label}`);
  for (const id of entry.categoryIds.slice(0, 3)) if (labelNames[id]) meta.push(labelNames[id]);
  if (entry.pinned) meta.push("Pinned");
  return {
    id: entry.id,
    title: entry.title,
    coverUrl: entry.coverUrl && artworkSrc(entry.coverUrl) ? entry.coverUrl : null,
    square: entry.coverShape === "square",
    frame: resolveFrame(entry.frame, accountFrame),
    meta,
    href: entryPath(entry),
  };
}

/** Header action that plays every entry of the collection as a full-screen film. Never autoplays. */
export function CollectionFilmButton({
  name,
  description,
  accent,
  icon,
  labelNames,
  className,
}: {
  name: string;
  description: string | null;
  accent: string | null;
  icon: ReactNode;
  labelNames: Record<string, string>;
  className?: string;
}) {
  const { all } = useLibrary();
  const { artworkFrame } = useSettings();
  const [slides, setSlides] = useState<FilmSlide[] | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  if (all.length === 0) return null;

  function close() {
    setSlides(null);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    });
  }

  return (
    <>
      <Button
        ref={opener}
        type="button"
        variant="outline"
        className={className}
        // Every entry, in library order, regardless of the current search and filters.
        onClick={() => setSlides(all.map((entry) => toSlide(entry, labelNames, artworkFrame)))}
        title="Play collection showcase: a cinematic tour of every entry"
        aria-label="Play collection showcase"
      >
        <Clapperboard aria-hidden />
        <span className="hidden lg:inline">Play</span>
      </Button>
      {slides
        ? createPortal(<CollectionFilmPlayer name={name} description={description} accent={accent} icon={icon} slides={slides} onClose={close} />, overlayHost())
        : null}
    </>
  );
}
