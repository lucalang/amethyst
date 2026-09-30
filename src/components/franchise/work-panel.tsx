"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaImage } from "@/components/media/media-image";
import { ProgressMeter } from "@/components/media/progress-meter";
import type { Arc } from "@/lib/data/franchise";
import { STATUS_LABELS } from "@/lib/format";
import { workProgress, type Work } from "@/lib/progress/derive";
import { cn } from "@/lib/utils";
import { ArcList, CreateArcDialog } from "./arcs";
import { EpisodeChecklist } from "./episode-checklist";
import { useProgressStore } from "./progress-store";
import { MarkAllButton, StatusScoreControls, UnmappedNotice, WatchedCountControl } from "./work-controls";

const KIND_LABEL: Record<Work["kind"], string> = { series: "TV", movie: "Movie", ova: "OVA", ona: "ONA", special: "Special" };

function workMeta(work: Work) {
  return [work.providerType ?? KIND_LABEL[work.kind], work.year, work.relation].filter(Boolean).join(" · ");
}

/** Main-series card inside the Arcs tab: progress, controls, arcs and episode checklist. */
export function WorkPanel({ entryId, work, arcs }: { entryId: string; work: Work; arcs: Arc[] }) {
  const { progress, episodesByParent } = useProgressStore();
  const episodes = episodesByParent.get(work.id) ?? [];
  const state = workProgress(work, progress, episodes);
  const lastArcEnd = Math.max(0, ...arcs.map((arc) => arc.endEpisode ?? 0));
  const headingId = `work-${work.id}`;

  return (
    <section aria-labelledby={headingId} id={`w-${work.id}`} className="scroll-mt-20 rounded-lg border border-border bg-card">
      <div className="flex gap-4 p-4">
        <div className="relative hidden aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-secondary sm:block">
          <MediaImage src={work.imageUrl} alt="" sizes="80px" fallbackLabel={work.title} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id={headingId} className="truncate text-base font-semibold">
                {work.title}
              </h3>
              <p className="text-xs text-muted-foreground">{workMeta(work)}</p>
            </div>
            <Badge variant="outline" className={cn(state.complete && "border-jade/40 text-jade")}>
              {STATUS_LABELS[state.status]}
            </Badge>
          </div>
          <ProgressMeter done={state.watched} total={state.total} label="episodes" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusScoreControls work={work} />
            <MarkAllButton work={work} />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-border p-3 sm:p-4">
        <UnmappedNotice work={work} />
        {episodes.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The provider has no episode list for this work{state.total === null ? " and its total is unknown" : ""}. Track it with a
              watched count.
            </p>
            <WatchedCountControl work={work} />
          </div>
        ) : (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Arcs</h4>
                <CreateArcDialog entryId={entryId} work={work} suggestedStart={lastArcEnd + 1} />
              </div>
              {arcs.length > 0 ? (
                <ArcList arcs={arcs} episodes={episodes} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No arcs yet. MyAnimeList does not publish arc boundaries; add curated ranges when you want them.
                </p>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Episodes{" "}
                <span className="font-normal text-muted-foreground">
                  ({state.checkedEpisodes}/{episodes.length} checked
                  {state.total !== null && episodes.length < state.total ? `, ${state.total - episodes.length} not listed by provider` : ""})
                </span>
              </h4>
              <EpisodeChecklist workId={work.id} episodes={episodes} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Compact row for movies, OVAs and specials. */
export function WorkRow({ work }: { work: Work }) {
  const { progress, episodesByParent, updateWork } = useProgressStore();
  const episodes = episodesByParent.get(work.id) ?? [];
  const state = workProgress(work, progress, episodes);
  const [expanded, setExpanded] = useState(false);
  const single = episodes.length === 0;
  const countable = single && work.kind !== "movie" && state.total !== 1;
  const checkboxId = `work-check-${work.id}`;

  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 p-3">
        <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
          <MediaImage src={work.imageUrl} alt="" sizes="48px" fallbackLabel={work.title} />
        </div>
        <div className="min-w-0 flex-1">
          {single ? (
            <label htmlFor={checkboxId} className="block cursor-pointer truncate text-sm font-medium">
              {work.title}
            </label>
          ) : (
            <p className="truncate text-sm font-medium">{work.title}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">{workMeta(work)}</p>
          {!single ? <ProgressMeter done={state.watched} total={state.total} label="episodes" className="mt-2 max-w-xs" /> : null}
        </div>
        {single ? (
          <div className="flex items-center gap-2">
            {countable ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`eps-${work.id}`}
                onClick={() => setExpanded(!expanded)}
                className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {state.watched}/{state.total ?? "?"}
                <ChevronDown aria-hidden className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                <span className="sr-only">Edit watched count</span>
              </button>
            ) : null}
            <span className="hidden text-xs text-muted-foreground sm:inline">{state.complete ? "Watched" : "Not watched"}</span>
            <Checkbox
              id={checkboxId}
              checked={state.complete}
              onCheckedChange={(value) =>
                value === true
                  ? updateWork({ itemId: work.id, status: "completed" })
                  : updateWork({ itemId: work.id, episodesWatched: 0, status: "plan_to_watch" })
              }
              className="size-6"
            />
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`eps-${work.id}`}
            onClick={() => setExpanded(!expanded)}
            className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Episodes
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {countable && expanded ? (
        <div id={`eps-${work.id}`} className="space-y-2 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">The provider has no episode list for this work.</p>
          <WatchedCountControl work={work} />
        </div>
      ) : null}
      {!single && expanded ? (
        <div id={`eps-${work.id}`} className="space-y-3 border-t border-border p-3">
          <UnmappedNotice work={work} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusScoreControls work={work} />
            <MarkAllButton work={work} />
          </div>
          <EpisodeChecklist workId={work.id} episodes={episodes} />
        </div>
      ) : null}
    </li>
  );
}
