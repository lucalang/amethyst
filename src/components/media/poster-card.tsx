import Link from "next/link";
import { Gamepad2, SquarePen, Tv } from "lucide-react";
import { entryProgress, entryState, type LibraryEntry } from "@/lib/progress/library";
import { cn } from "@/lib/utils";
import { MediaImage } from "./media-image";
import { ProgressMeter } from "./progress-meter";

const KIND = {
  anime: { label: "Anime", icon: Tv },
  game: { label: "Game", icon: Gamepad2 },
  custom: { label: "Custom", icon: SquarePen },
} as const;

export function entryHref(entry: Pick<LibraryEntry, "id">) {
  return `/entries/${entry.id}`;
}

export function PosterCard({ entry, priority }: { entry: LibraryEntry; priority?: boolean }) {
  const kind = KIND[entry.kind];
  const progress = entryProgress(entry);
  const state = entryState(entry.summary);
  const Icon = kind.icon;
  return (
    <Link
      href={entryHref(entry)}
      className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`${entry.title}, ${kind.label}, ${progress.done} of ${progress.total ?? "unknown"} ${progress.label}${state === "completed" ? ", completed" : ""}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-secondary">
        <MediaImage
          src={entry.coverUrl}
          alt=""
          sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw"
          priority={priority}
          fallbackLabel={entry.title}
          className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          <Icon aria-hidden className="size-3" /> {kind.label}
        </span>
        {state === "completed" ? (
          <span className="absolute top-2 right-2 rounded-sm bg-jade px-1.5 py-0.5 text-[11px] font-semibold text-jade-foreground">Done</span>
        ) : null}
        <div className="absolute inset-x-2 bottom-2">
          <ProgressMeter done={progress.done} total={progress.total} compact />
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-snug font-medium">{entry.title}</p>
      <p className={cn("text-xs text-muted-foreground tabular-nums")}>
        {progress.done}/{progress.total ?? "?"} {progress.label}
      </p>
    </Link>
  );
}
