import Link from "next/link";
import { entryPath } from "@/lib/collections";
import { entryProgress, entryState, type LibraryEntry } from "@/lib/progress/library";
import { MediaImage } from "./media-image";
import { ProgressMeter } from "./progress-meter";

export function PosterCard({ entry, priority }: { entry: LibraryEntry; priority?: boolean }) {
  const progress = entryProgress(entry);
  const state = entryState(entry.summary);
  return (
    <Link
      href={entryPath(entry)}
      className="poster-card group block rounded-lg"
      aria-label={`${entry.title}, ${progress.done} of ${progress.total ?? "no"} ${progress.label} done${state === "completed" ? ", completed" : ""}`}
    >
      <div className="scroll-fade">
        <div
          className={`poster-frame relative ${entry.kind === "game" ? "aspect-square" : "aspect-[2/3]"} overflow-hidden rounded-lg border border-border bg-surface`}
        >
          <MediaImage
            src={entry.coverUrl}
            alt=""
            priority={priority}
            fallbackLabel={entry.title}
            className="poster-artwork"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          {state === "completed" ? (
            <span className="absolute top-2 right-2 rounded-sm bg-amethyst px-1.5 py-0.5 text-[11px] font-semibold text-amethyst-foreground">Done</span>
          ) : null}
          {progress.total ? (
            <div className="absolute inset-x-2 bottom-2">
              <ProgressMeter done={progress.done} total={progress.total} compact />
            </div>
          ) : null}
        </div>
        <p className="poster-title mt-2.5 line-clamp-2 text-sm leading-snug font-semibold">{entry.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {progress.total ? `${progress.done}/${progress.total} ${progress.label}` : "No tasks yet"}
        </p>
      </div>
    </Link>
  );
}
