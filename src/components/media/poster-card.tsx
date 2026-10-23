import Link from "next/link";
import { Pin } from "lucide-react";
import { entryPath } from "@/lib/collections";
import type { PinStyle } from "@/lib/preferences";
import { entryProgress, entryState, progressPhrase, type LibraryEntry } from "@/lib/progress/library";
import { cn } from "@/lib/utils";
import { MediaImage } from "./media-image";
import { PinButton, PosterMenu } from "./pin-button";
import { ProgressMeter } from "./progress-meter";

/** Which details a library card shows (account setting). Defaults to the original presentation. */
export type CardDisplay = { title: boolean; labels: boolean; progress: boolean };
const DEFAULT_DISPLAY: CardDisplay = { title: true, labels: false, progress: true };

export function PosterCard({
  entry,
  priority,
  pinStyle = "current",
  display = DEFAULT_DISPLAY,
  labels = [],
}: {
  entry: LibraryEntry;
  priority?: boolean;
  pinStyle?: PinStyle;
  display?: CardDisplay;
  /** Label names for this entry (shown when `display.labels` is on). */
  labels?: string[];
}) {
  const progress = entryProgress(entry);
  const state = entryState(entry.summary);
  const clean = pinStyle === "clean";
  const href = entryPath(entry);
  const pinned = Boolean(entry.pinned);
  const showLabels = display.labels && labels.length > 0;
  const label = [
    entry.title,
    progressPhrase(progress),
    state === "completed" ? "completed" : null,
    showLabels ? `labels: ${labels.join(", ")}` : null,
    clean && pinned ? "pinned to Home" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const progressText = progress.total ? `${progress.done}/${progress.total} ${progress.label}` : `No ${progress.label} yet`;
  // Clean covers keep their action menu beside the details; leave room for it on every line.
  const menuRoom = clean ? "pr-8 pointer-coarse:pr-10" : "";
  const hasDetails = display.title || showLabels || display.progress;
  return (
    <div className="poster-card group block rounded-lg">
      <div className="scroll-fade">
        <div className="relative">
          <Link href={href} className="poster-link block rounded-lg" aria-label={label}>
            <div
              className={`poster-frame relative ${entry.coverShape === "square" ? "aspect-square" : "aspect-[2/3]"} overflow-hidden rounded-lg border border-border bg-surface`}
            >
              <MediaImage
                src={entry.coverUrl}
                alt=""
                priority={priority}
                fallbackLabel={entry.title}
                className="poster-artwork"
              />
              {clean || !display.progress ? null : (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  {state === "completed" ? (
                    <span className="absolute top-2 right-2 rounded-sm bg-amethyst px-1.5 py-0.5 text-[11px] font-semibold text-amethyst-foreground">Done</span>
                  ) : null}
                  {progress.total ? (
                    <div className="absolute inset-x-2 bottom-2">
                      <ProgressMeter done={progress.done} total={progress.total} compact />
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {display.title ? (
              <p className={cn("poster-title mt-2.5 line-clamp-2 text-sm leading-snug font-semibold break-words", menuRoom)}>{entry.title}</p>
            ) : null}
            {showLabels ? (
              <p className={cn("truncate text-[11px] leading-5 font-medium text-amethyst/80", display.title ? "mt-0.5" : "mt-2.5", menuRoom)} title={labels.join(" · ")}>
                {labels.join(" · ")}
              </p>
            ) : null}
            {clean && (display.progress || !hasDetails) ? (
              <p className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums", display.title || showLabels ? "mt-0.5" : "mt-2.5 min-h-7 pointer-coarse:min-h-9", menuRoom)}>
                {pinned ? <Pin aria-hidden className="size-3 shrink-0 fill-current text-amethyst" /> : null}
                {display.progress ? (
                  <span className="truncate" title={progressText}>
                    {progressText}
                    {state === "completed" ? <span className="text-amethyst"> · Done</span> : null}
                  </span>
                ) : null}
              </p>
            ) : display.progress ? (
              <p className={cn("truncate text-xs text-muted-foreground tabular-nums", display.title || showLabels ? "mt-0.5" : "mt-2.5")} title={progressText}>
                {progressText}
              </p>
            ) : clean && pinned ? (
              <p className={cn("mt-0.5 flex items-center", menuRoom)}>
                <Pin aria-hidden className="size-3 shrink-0 fill-current text-amethyst" />
              </p>
            ) : null}
          </Link>
          {clean ? (
            <PosterMenu entryId={entry.id} title={entry.title} href={href} pinned={pinned} className="absolute right-0 bottom-0 z-[3]" />
          ) : (
            <PinButton entryId={entry.id} title={entry.title} pinned={pinned} />
          )}
        </div>
      </div>
    </div>
  );
}
