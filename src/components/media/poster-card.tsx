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
      className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      aria-label={`${entry.title}, ${progress.done} of ${progress.total ?? "no"} ${progress.label} done${state === "completed" ? ", completed" : ""}`}
    >
      <div className="scroll-fade">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-surface transition-[border-color,box-shadow] duration-200 group-hover:border-amethyst/40 group-hover:shadow-[0_0_0_1px_rgb(165_124_255/0.15),0_18px_40px_-18px_rgb(165_124_255/0.45)]">
          <MediaImage
            src={entry.coverUrl}
            alt=""
            priority={priority}
            fallbackLabel={entry.title}
            className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
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
        <p className="mt-2.5 line-clamp-2 text-sm leading-snug font-semibold transition-colors group-hover:text-amethyst">{entry.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {progress.total ? `${progress.done}/${progress.total} ${progress.label}` : "No tasks yet"}
        </p>
      </div>
    </Link>
  );
}
