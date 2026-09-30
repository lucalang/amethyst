"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckRow } from "@/components/media/check-row";
import { groupState, rowFor, type Episode } from "@/lib/progress/derive";
import { cn } from "@/lib/utils";
import { useProgressStore } from "./progress-store";

const GROUP_SIZE = 50;

export function EpisodeRows({ episodes }: { episodes: Episode[] }) {
  const { progress, setChecked } = useProgressStore();
  return (
    <ul className="space-y-0.5">
      {episodes.map((episode) => (
        <li key={episode.id}>
          <CheckRow
            id={`ep-${episode.id}`}
            checked={rowFor(progress, episode.id).is_checked}
            onChange={(checked) => setChecked([episode.id], checked)}
            prefix={episode.number ?? "–"}
            label={episode.title}
            meta={
              <>
                {episode.filler ? (
                  <Badge variant="outline" className="border-coral/40 text-[10px] text-coral">
                    Filler
                  </Badge>
                ) : null}
                {episode.recap ? (
                  <Badge variant="outline" className="text-[10px]">
                    Recap
                  </Badge>
                ) : null}
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}

/** Episode checklist split into collapsible groups so long series stay fast. */
export function EpisodeChecklist({ workId, episodes }: { workId: string; episodes: Episode[] }) {
  const { progress, setChecked } = useProgressStore();
  const groups = useMemo(() => {
    const list: Episode[][] = [];
    for (let index = 0; index < episodes.length; index += GROUP_SIZE) list.push(episodes.slice(index, index + GROUP_SIZE));
    return list;
  }, [episodes]);

  const firstOpen = useMemo(() => {
    const index = groups.findIndex((group) => group.some((episode) => !rowFor(progress, episode.id).is_checked));
    return index === -1 ? 0 : index;
    // Only choose the initially open group once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  const [open, setOpen] = useState<Set<number>>(() => new Set([firstOpen]));

  if (groups.length === 1) return <EpisodeRows episodes={episodes} />;

  return (
    <div className="space-y-1">
      {groups.map((group, index) => {
        const ids = group.map((episode) => episode.id);
        const state = groupState(ids, progress);
        const first = group[0]?.number ?? index * GROUP_SIZE + 1;
        const last = group.at(-1)?.number ?? first;
        const isOpen = open.has(index);
        const panelId = `${workId}-group-${index}`;
        return (
          <div key={panelId} className="rounded-md border border-border">
            <div className="flex min-h-11 items-center gap-2 px-2">
              <Checkbox
                aria-label={`Mark episodes ${first} to ${last} as ${state.state === "checked" ? "unwatched" : "watched"}`}
                checked={state.state === "checked" ? true : state.state === "indeterminate" ? "indeterminate" : false}
                onCheckedChange={() => setChecked(ids, state.state !== "checked")}
                className="size-5 data-[state=checked]:border-jade data-[state=checked]:bg-jade data-[state=indeterminate]:border-jade data-[state=indeterminate]:bg-jade/30"
              />
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
                className="flex min-h-11 flex-1 items-center gap-2 rounded-md text-left text-sm"
              >
                <ChevronRight aria-hidden className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                <span className="flex-1 font-medium">
                  Episodes {first}–{last}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {state.checked}/{state.total}
                </span>
              </button>
            </div>
            {isOpen ? (
              <div id={panelId} className="border-t border-border p-1">
                <EpisodeRows episodes={group} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
