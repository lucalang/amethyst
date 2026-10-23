import Link from "next/link";
import { Pin } from "lucide-react";
import { entryPath } from "@/lib/collections";
import type { PinStyle } from "@/lib/preferences";
import { entryProgress, entryState, type LibraryEntry } from "@/lib/progress/library";
import { MediaImage } from "./media-image";
import { PinButton, PosterMenu } from "./pin-button";
import { ProgressMeter } from "./progress-meter";

export function PosterCard({ entry, priority, pinStyle = "current" }: { entry: LibraryEntry; priority?: boolean; pinStyle?: PinStyle }) {
  const progress = entryProgress(entry);
  const state = entryState(entry.summary);
  const clean = pinStyle === "clean";
  const href = entryPath(entry);
  const pinned = Boolean(entry.pinned);
  const label = `${entry.title}, ${progress.done} of ${progress.total ?? "no"} ${progress.label} done${state === "completed" ? ", completed" : ""}${clean && pinned ? ", pinned to Home" : ""}`;
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
              {clean ? null : (
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
            <p className={`poster-title mt-2.5 line-clamp-2 text-sm leading-snug font-semibold ${clean ? "pr-8 pointer-coarse:pr-10" : ""}`}>{entry.title}</p>
            {clean ? (
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 pr-8 text-xs text-muted-foreground tabular-nums pointer-coarse:pr-10">
                {pinned ? <Pin aria-hidden className="size-3 shrink-0 fill-current text-amethyst" /> : null}
                <span className="truncate">
                  {progress.total ? `${progress.done}/${progress.total} ${progress.label}` : "No tasks yet"}
                  {state === "completed" ? <span className="text-amethyst"> · Done</span> : null}
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {progress.total ? `${progress.done}/${progress.total} ${progress.label}` : "No tasks yet"}
              </p>
            )}
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
