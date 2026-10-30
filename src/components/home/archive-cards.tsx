import { IntentLink as Link } from "@/components/layout/intent-link";
import { ArrowRight, ArrowUpRight, FileText, ListChecks, PlayCircle } from "lucide-react";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { CoverStack } from "@/components/home/cover-stack";
import { MediaImage } from "@/components/media/media-image";
import { ProgressMeter } from "@/components/media/progress-meter";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath } from "@/lib/collections";
import type { HomeCollection, HomeContinue } from "@/lib/data/home";
import { entryProgress } from "@/lib/progress/library";
import { cn } from "@/lib/utils";

export function ContinueCard({ item }: { item: HomeContinue }) {
  const { entry, file } = item;
  const progress = entryProgress(entry);
  const FileIcon = file?.kind === "checklist" ? ListChecks : FileText;
  return (
    <Link
      href={item.href}
      className="group/continue relative flex w-full max-w-2xl min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-white/[0.1] bg-black/45 p-3 pr-4 backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-amethyst/50 hover:bg-amethyst/[0.07] hover:shadow-[0_22px_48px_-24px_rgb(var(--accent-rgb)/0.8)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 sm:gap-5 sm:pr-5"
    >
      <span className={cn("relative shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-surface shadow-[0_12px_28px_-12px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))]", entry.coverShape === "square" ? "size-20" : "h-24 w-16")}>
        <MediaImage src={entry.coverUrl} alt="" sizes="80px" fallbackLabel={entry.title} priority className="transition-[scale] duration-700 group-hover/continue:scale-105" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-amethyst">
          <PlayCircle aria-hidden className="size-3.5" />
          Continue where you left off
        </span>
        <span className="mt-1 block truncate text-lg leading-snug font-semibold transition-colors group-hover/continue:text-amethyst">{entry.title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-foreground/75">
          {file ? <>
            <FileIcon aria-hidden className="size-3.5 shrink-0 text-amethyst/80" />
            <span className="truncate">{file.name}</span>
            <span aria-hidden className="text-muted-foreground">·</span>
          </> : null}
          <span className="truncate text-muted-foreground">{item.collectionName}</span>
        </span>
        {progress.total ? (
          <ProgressMeter done={progress.done} total={progress.total} label={progress.label} className="mt-2.5 max-w-xs" />
        ) : (
          <span className="mt-2 block truncate text-xs text-muted-foreground">No {progress.label} yet</span>
        )}
      </span>
      <ArrowRight aria-hidden className="hidden size-5 shrink-0 text-amethyst transition-transform group-hover/continue:translate-x-1 sm:block" />
    </Link>
  );
}

export function CollectionCard({ collection }: { collection: HomeCollection }) {
  const accent = accentStyle(collection.accentColor);
  return (
    <Link
      href={collectionPath(collection)}
      title={collection.name}
      style={accent}
      className={cn(
        "group/collection relative isolate flex h-full min-w-0 items-start gap-4 overflow-hidden rounded-xl border bg-surface/50 p-4 transition-[border-color,background-color,translate,box-shadow] duration-200 outline-none hover:-translate-y-0.5 focus-visible:ring-2 motion-reduce:hover:translate-y-0",
        accent
          ? "border-[var(--ca-line)] hover:border-[var(--ca)] hover:bg-[var(--ca-soft)] hover:shadow-[0_18px_40px_-24px_var(--ca-glow)] focus-visible:border-[var(--ca)] focus-visible:ring-[var(--ca)]"
          : "border-white/[0.08] hover:border-amethyst/40 hover:bg-amethyst/[0.05] hover:shadow-[0_18px_40px_-24px_rgb(var(--accent-rgb)/0.7)] focus-visible:border-amethyst focus-visible:ring-amethyst/50",
      )}
    >
      {collection.bannerUrl ? (
        <span aria-hidden className="absolute inset-0 -z-10">
          <MediaImage src={collection.bannerUrl} alt="" sizes="auto, (min-width: 1024px) 33vw, 100vw" className="opacity-35 transition-opacity duration-300 group-hover/collection:opacity-45" />
          <span className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
        </span>
      ) : null}
      {collection.previews.length ? (
        <CoverStack previews={collection.previews} hoverGroup />
      ) : (
        <span aria-hidden className={cn("grid h-24 w-16 shrink-0 place-items-center rounded-md border border-dashed", accent ? "border-[var(--ca-line)] text-[var(--ca)]" : "border-white/[0.12] text-amethyst/70")}>
          <CollectionIcon icon={collection.icon} className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1 self-center">
        <span className="flex items-start justify-between gap-2">
          <span className={cn("flex min-w-0 items-center gap-2 text-base font-semibold transition-colors", accent ? "group-hover/collection:text-[var(--ca)]" : "group-hover/collection:text-amethyst")}>
            {collection.icon && collection.previews.length ? (
              <CollectionIcon icon={collection.icon} className={cn("size-4 shrink-0", accent ? "text-[var(--ca)]" : "text-amethyst")} />
            ) : null}
            <span className="truncate">{collection.name}</span>
          </span>
          <ArrowUpRight aria-hidden className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5", accent ? "group-hover/collection:text-[var(--ca)]" : "group-hover/collection:text-amethyst")} />
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {collection.entryCount.toLocaleString("en")} {collection.entryCount === 1 ? "entry" : "entries"}
        </span>
        {collection.description ? (
          <span className="mt-2 line-clamp-2 text-sm break-words whitespace-pre-line text-foreground/70">{collection.description}</span>
        ) : null}
      </span>
    </Link>
  );
}
