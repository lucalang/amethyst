import type { CSSProperties } from "react";
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
      style={{ background: "color-mix(in oklab, var(--card) 78%, transparent)" }}
      className="ui-card group/continue isolate flex w-full max-w-2xl min-w-0 items-center gap-4 p-3 pr-4 backdrop-blur-md sm:gap-5 sm:pr-5"
    >
      {item.bannerUrl ? (
        <span aria-hidden className="absolute inset-0 -z-10">
          <MediaImage src={item.bannerUrl} alt="" sizes="auto, (min-width: 768px) 640px, 100vw" className="object-[50%_32%] opacity-42 transition-[opacity,scale] duration-500 group-hover/continue:scale-[1.02] group-hover/continue:opacity-55" />
          <span className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/76 to-black/35" />
        </span>
      ) : null}
      <span className={cn("relative shrink-0 overflow-hidden rounded-xl border border-(--tone)/30 bg-surface shadow-[0_14px_30px_-16px_var(--tone)]", entry.coverShape === "square" ? "size-20" : "h-24 w-16")}>
        <MediaImage src={entry.coverUrl} alt="" sizes="80px" fallbackLabel={entry.title} priority className="transition-[scale] duration-700 group-hover/continue:scale-105" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="ui-pill" data-tone>
          <PlayCircle aria-hidden className="size-3.5 text-(--tone)" />
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
      <span aria-hidden className="ui-icon hidden sm:grid">
        <ArrowRight className="size-4 transition-transform group-hover/continue:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}

export function CollectionCard({ collection }: { collection: HomeCollection }) {
  const accent = accentStyle(collection.accentColor);
  return (
    <Link
      href={collectionPath(collection)}
      title={collection.name}
      style={accent ? ({ ...accent, "--tone": "var(--ca)" } as CSSProperties) : undefined}
      className="ui-card group/collection isolate flex h-full min-w-0 items-start gap-4 p-4"
    >
      {collection.bannerUrl ? (
        <span aria-hidden className="absolute inset-0 -z-10">
          <MediaImage src={collection.bannerUrl} alt="" sizes="auto, (min-width: 1024px) 33vw, 100vw" className="object-[50%_32%] opacity-52 transition-[opacity,scale] duration-500 group-hover/collection:scale-[1.03] group-hover/collection:opacity-65" />
          <span className="absolute inset-0 bg-[radial-gradient(75%_95%_at_0%_100%,color-mix(in_oklab,var(--tone)_22%,transparent),transparent_70%)]" />
          <span className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/72 to-black/30" />
          <span className="absolute inset-x-0 bottom-0 h-[1.5px] bg-linear-to-r from-(--tone) via-(--tone)/45 to-transparent opacity-75" />
        </span>
      ) : (
        <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_0%_0%,color-mix(in_oklab,var(--tone)_12%,transparent),transparent_70%)]" />
      )}
      {collection.previews.length ? (
        <CoverStack previews={collection.previews} hoverGroup />
      ) : (
        <span aria-hidden className="ui-empty grid h-24 w-16 shrink-0 place-items-center text-(--tone)">
          <CollectionIcon icon={collection.icon} className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1 self-center">
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-semibold transition-colors group-hover/collection:text-(--tone)">
            {collection.icon && collection.previews.length ? (
              <span aria-hidden className="ui-icon ui-icon-sm">
                <CollectionIcon icon={collection.icon} className="size-3.5" />
              </span>
            ) : null}
            <span className="truncate">{collection.name}</span>
          </span>
          <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5 group-hover/collection:text-(--tone) motion-reduce:transition-none" />
        </span>
        <span className="ui-pill mt-1.5 tabular-nums">
          <span aria-hidden className="ui-dot" />
          {collection.entryCount.toLocaleString("en")} {collection.entryCount === 1 ? "entry" : "entries"}
        </span>
        {collection.description ? (
          <span className="mt-2 line-clamp-2 text-sm break-words whitespace-pre-line text-foreground/70">{collection.description}</span>
        ) : null}
      </span>
    </Link>
  );
}
