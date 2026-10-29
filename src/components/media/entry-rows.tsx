import Link from "next/link";
import { Pin } from "lucide-react";
import { entryPath } from "@/lib/collections";
import { entryProgress, entryState, progressPhrase, type LibraryEntry, type LibraryState } from "@/lib/progress/library";
import { cn } from "@/lib/utils";
import { MediaImage } from "./media-image";
import { PosterMenu } from "./pin-button";
import { ProgressMeter } from "./progress-meter";

const STATUS: Record<LibraryState, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" };

function Thumb({ entry, size }: { entry: LibraryEntry; size: "sm" | "md" }) {
  const square = entry.coverShape === "square";
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-md border border-border bg-surface",
        square ? "aspect-square" : "aspect-[2/3]",
        size === "md" ? (square ? "w-12" : "w-10") : square ? "w-9" : "w-8",
      )}
    >
      <MediaImage src={entry.coverUrl} alt="" sizes="auto, 48px" fallbackLabel={entry.title} className="text-[10px]" />
    </span>
  );
}

function ProgressCell({ entry }: { entry: LibraryEntry }) {
  const progress = entryProgress(entry);
  return progress.total ? (
    <ProgressMeter done={progress.done} total={progress.total} label={progress.label} />
  ) : (
    <span className="text-xs text-muted-foreground">No {progress.label} yet</span>
  );
}

function StatusBadge({ state }: { state: LibraryState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        state === "completed" ? "bg-amethyst/15 text-amethyst" : state === "in_progress" ? "bg-white/[0.06] text-foreground/85" : "text-muted-foreground",
      )}
    >
      {STATUS[state]}
    </span>
  );
}

function rowLabel(entry: LibraryEntry, labels: string[]) {
  const progress = entryProgress(entry);
  return [entry.title, progressPhrase(progress), entryState(entry.summary) === "completed" ? "completed" : null, labels.length ? `labels: ${labels.join(", ")}` : null, entry.pinned ? "pinned to Home" : null]
    .filter(Boolean)
    .join(", ");
}

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });

/** One entry as a compact row: small cover, title and labels, progress and the actions menu. */
export function EntryListRow({ entry, labels }: { entry: LibraryEntry; labels: string[] }) {
  const state = entryState(entry.summary);
  const href = entryPath(entry);
  return (
    <div className="entry-row group relative flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors duration-150 hover:border-white/[0.06] hover:bg-white/[0.035] has-[a:focus-visible]:border-ring">
      <Thumb entry={entry} size="md" />
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          aria-label={rowLabel(entry, labels)}
          className="block truncate text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-lg group-hover:text-amethyst"
        >
          {entry.title}
        </Link>
        {labels.length ? (
          <p className="truncate text-[11px] leading-5 font-medium text-amethyst/80" title={labels.join(" · ")}>
            {labels.join(" · ")}
          </p>
        ) : null}
        <div className="mt-1 sm:hidden">
          <ProgressCell entry={entry} />
        </div>
      </div>
      <div className="hidden w-44 shrink-0 sm:block lg:w-56">
        <ProgressCell entry={entry} />
      </div>
      <div className="hidden w-24 shrink-0 md:block">
        <StatusBadge state={state} />
      </div>
      {entry.pinned ? <Pin aria-hidden className="size-3.5 shrink-0 fill-current text-amethyst" /> : null}
      <PosterMenu entryId={entry.id} title={entry.title} href={href} pinned={Boolean(entry.pinned)} coverUrl={entry.coverUrl} className="relative z-[1]" />
    </div>
  );
}

/** The collection as a table. Lesser columns step aside on narrow screens instead of clipping. */
export function EntryTable({ name, entries, labelNames }: { name: string; entries: LibraryEntry[]; labelNames: Record<string, string> }) {
  const head = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  const cell = "px-3 py-2.5 align-middle";
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
      <table aria-label={name} className="w-full border-collapse text-sm">
        <thead className="bg-white/[0.025]">
          <tr className="border-b border-white/[0.08]">
            <th scope="col" className={head}>Title</th>
            <th scope="col" className={cn(head, "hidden md:table-cell")}>Labels</th>
            <th scope="col" className={cn(head, "w-40 lg:w-52")}>Progress</th>
            <th scope="col" className={cn(head, "hidden sm:table-cell")}>Status</th>
            <th scope="col" className={cn(head, "hidden lg:table-cell")}>Last active</th>
            <th scope="col" className={cn(head, "hidden xl:table-cell")}>Added</th>
            <th scope="col" className={cn(head, "w-10")}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const labels = entry.categoryIds.flatMap((id) => labelNames[id] ?? []);
            const href = entryPath(entry);
            const state = entryState(entry.summary);
            return (
              <tr key={entry.id} className="entry-row group border-b border-white/[0.05] transition-colors duration-150 last:border-b-0 hover:bg-white/[0.035] has-[a:focus-visible]:bg-white/[0.05]">
                <td className={cn(cell, "w-full max-w-0")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb entry={entry} size="sm" />
                    <div className="min-w-0">
                      <Link
                        href={href}
                        aria-label={rowLabel(entry, labels)}
                        className="block truncate font-semibold outline-none hover:text-amethyst focus-visible:text-amethyst focus-visible:underline"
                      >
                        {entry.pinned ? <Pin aria-hidden className="mr-1.5 inline size-3 fill-current align-[-1px] text-amethyst" /> : null}
                        {entry.title}
                      </Link>
                      {labels.length ? (
                        <p className="truncate text-[11px] leading-5 font-medium text-amethyst/80 md:hidden" title={labels.join(" · ")}>
                          {labels.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className={cn(cell, "hidden max-w-56 md:table-cell")}>
                  {labels.length ? (
                    <span className="line-clamp-2 text-xs text-amethyst/85" title={labels.join(" · ")}>
                      {labels.join(" · ")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className={cn(cell, "w-40 min-w-32 lg:w-52")}>
                  <ProgressCell entry={entry} />
                </td>
                <td className={cn(cell, "hidden sm:table-cell")}>
                  <StatusBadge state={state} />
                </td>
                <td className={cn(cell, "hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell")} suppressHydrationWarning>
                  {date(entry.lastActivityAt)}
                </td>
                <td className={cn(cell, "hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:table-cell")} suppressHydrationWarning>
                  {date(entry.createdAt)}
                </td>
                <td className={cn(cell, "pr-2")}>
                  <PosterMenu entryId={entry.id} title={entry.title} href={href} pinned={Boolean(entry.pinned)} coverUrl={entry.coverUrl} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
